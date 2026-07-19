import type { EngineEvent, SceneManifest } from "../engine/types";
import type { DirectorOptions } from "../engine/director";
import rawPlan from "../../pipeline/sfx.plan.json";

export type SoundBus = "ambience" | "diegetic" | "sfx";
export type SoundKind = "ambience" | "diegetic-event" | "transition" | "authored-silence";
export type RuntimeOwner = "adapter" | "manifest" | "cutscene" | "handoff";

export interface SoundAsset {
  id: string;
  file: string;
  seconds: number;
  lockedBaseline: boolean;
  prompt: string;
}

export interface SoundTrigger {
  type: EngineEvent["type"] | "cue";
  name?: string;
  zone?: string;
  cueId?: string;
}

export interface SoundStop {
  type: "natural-end" | "scene-exit" | "event" | "cue";
  eventType?: EngineEvent["type"];
  name?: string;
  zone?: string;
  cueId?: string;
}

export interface SoundCue {
  id: string;
  kind: SoundKind;
  trigger: SoundTrigger;
  asset: string | null;
  bus: SoundBus;
  runtimeOwner: RuntimeOwner;
  loop: boolean;
  replay?: { mode: "once" | "repeatable"; cooldownMs?: number; maxPlays?: number };
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  duckUnderNarrationDb: number;
  spatial: string;
  stop: SoundStop;
  stopBuses?: SoundBus[];
  caveat: string;
}

export interface SceneSoundPlan {
  id: string;
  label: string;
  musicPolicy: string;
  cues: SoundCue[];
}

export interface SoundDesignPlan {
  version: number;
  provider: { name: string; endpoint: string; promptInfluence: number };
  policy: {
    narrationDuckDb: number;
    musicIssue: number;
    spokenAudioOwner: string;
    generatedBuses: SoundBus[];
  };
  assets: SoundAsset[];
  scenes: SceneSoundPlan[];
}

export const soundDesignPlan = rawPlan as SoundDesignPlan;

export function validateSoundDesignPlan(plan: SoundDesignPlan): void {
  const assetFiles = new Set<string>();
  for (const asset of plan.assets) {
    if (assetFiles.has(asset.file)) throw new Error(`duplicate sound asset ${asset.file}`);
    assetFiles.add(asset.file);
    if (!asset.prompt.toLowerCase().includes("no music")) {
      throw new Error(`sound asset prompt must exclude music: ${asset.file}`);
    }
  }

  const cueIds = new Set<string>();
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      if (cueIds.has(cue.id)) throw new Error(`duplicate sound cue ${cue.id}`);
      cueIds.add(cue.id);
      if (cue.asset && !assetFiles.has(cue.asset)) {
        throw new Error(`sound cue ${cue.id} references unknown asset ${cue.asset}`);
      }
      if (cue.kind === "authored-silence" && cue.asset !== null) {
        throw new Error(`authored silence ${cue.id} cannot reference generated media`);
      }
    }
  }
}

validateSoundDesignPlan(soundDesignPlan);

export interface SoundPlaybackPort {
  ensure(): void;
  play(cue: SoundCue, asset: SoundAsset): void;
  stopCue(cueId: string, fadeOutMs: number): void;
  stopBuses(buses: readonly SoundBus[], fadeOutMs: number): void;
  stopAll(fadeOutMs?: number): void;
  setNarrationActive(active: boolean): void;
  setPaused(paused: boolean): void;
  dispose(): Promise<void> | void;
}

function triggerMatches(trigger: SoundTrigger, event: EngineEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (event.type === "action" || event.type === "model-event") return trigger.name === event.name;
  if (event.type === "zone-enter" || event.type === "zone-exit") return trigger.zone === event.zone;
  return event.type === "scene-start";
}

function stopMatches(stop: SoundStop, event: EngineEvent): boolean {
  if (stop.type !== "event" || stop.eventType !== event.type) return false;
  if (event.type === "action" || event.type === "model-event") return stop.name === event.name;
  if (event.type === "zone-enter" || event.type === "zone-exit") return stop.zone === event.zone;
  return event.type === "scene-start";
}

/**
 * Main/shell-side adapter for #37's normalized Director event observer.
 * It never changes story timing and never suppresses an EngineEvent.
 */
export class SoundDesignController {
  private currentSceneId: string | null = null;
  private playCounts = new Map<string, number>();
  private lastPlayedAt = new Map<string, number>();
  private stoppedCueIds = new Set<string>();
  private readonly sceneById = new Map(soundDesignPlan.scenes.map((scene) => [scene.id, scene]));
  private readonly assetByFile = new Map(soundDesignPlan.assets.map((asset) => [asset.file, asset]));

  constructor(
    private readonly playback: SoundPlaybackPort,
    private readonly now: () => number = () => performance.now()
  ) {}

  ensure(): void {
    this.playback.ensure();
  }

  onEngineEvent = (event: EngineEvent, sceneId: string): void => {
    if (event.type === "scene-start" && sceneId !== this.currentSceneId) {
      this.playback.stopAll();
      this.playback.setPaused(false);
      this.currentSceneId = sceneId;
      this.playCounts.clear();
      this.lastPlayedAt.clear();
      this.stoppedCueIds.clear();
    }
    if (sceneId !== this.currentSceneId) return;

    const scene = this.sceneById.get(sceneId);
    if (!scene) return;

    for (const cue of scene.cues) {
      if (stopMatches(cue.stop, event)) {
        this.stoppedCueIds.add(cue.id);
        this.playback.stopCue(cue.id, cue.fadeOutMs);
      }
    }

    for (const cue of scene.cues) {
      if (cue.runtimeOwner !== "adapter" || !triggerMatches(cue.trigger, event)) continue;
      if (cue.kind === "authored-silence") {
        this.playback.stopBuses(cue.stopBuses ?? [cue.bus], cue.fadeOutMs);
        continue;
      }
      if (!cue.asset || !this.shouldPlay(cue)) continue;
      const asset = this.assetByFile.get(cue.asset);
      if (!asset) continue;
      this.playback.play(cue, asset);
      this.playCounts.set(cue.id, (this.playCounts.get(cue.id) ?? 0) + 1);
      this.lastPlayedAt.set(cue.id, this.now());
    }
  };

  setNarrationActive(active: boolean): void {
    this.playback.setNarrationActive(active);
  }

  setPaused(paused: boolean): void {
    this.playback.setPaused(paused);
  }

  teardown(): void {
    this.currentSceneId = null;
    this.playCounts.clear();
    this.lastPlayedAt.clear();
    this.stoppedCueIds.clear();
    this.playback.stopAll();
  }

  dispose(): Promise<void> | void {
    this.teardown();
    return this.playback.dispose();
  }

  private shouldPlay(cue: SoundCue): boolean {
    if (this.stoppedCueIds.has(cue.id)) return false;
    const replay = cue.replay ?? { mode: "once" as const };
    const count = this.playCounts.get(cue.id) ?? 0;
    if (replay.mode === "once") return count === 0;
    if (replay.maxPlays !== undefined && count >= replay.maxPlays) return false;
    const last = this.lastPlayedAt.get(cue.id);
    return last === undefined || this.now() - last >= (replay.cooldownMs ?? 0);
  }
}

export interface SoundDirectorHooks {
  onEngineEvent: NonNullable<DirectorOptions["onEngineEvent"]>;
  onPauseState: NonNullable<DirectorOptions["onPauseState"]>;
}

/** Typed shell-side consumption of #58's observer seams. Story dispatch stays in Director. */
export function createSoundDirectorHooks(controller: SoundDesignController): SoundDirectorHooks {
  return {
    onEngineEvent: controller.onEngineEvent,
    onPauseState: ({ paused }) => controller.setPaused(paused),
  };
}

type NarrationObserver = Pick<MutationObserver, "observe" | "disconnect">;
type NarrationObserverFactory = (callback: MutationCallback) => NarrationObserver;

/**
 * The Director already exposes spoken playback through its subtitle surface.
 * Observe that surface in the shell so the separate SFX context ducks for the
 * exact spoken interval without adding a second story or timing callback.
 */
export function observeNarrationDucking(
  container: ParentNode,
  controller: Pick<SoundDesignController, "setNarrationActive">,
  createObserver: NarrationObserverFactory = (callback) => new MutationObserver(callback)
): () => void {
  const subtitle = container.querySelector<HTMLElement>(".subtitle-bar");
  if (!subtitle) throw new Error("sound design requires Director's subtitle surface");

  const sync = () => controller.setNarrationActive(Boolean(subtitle.textContent?.trim()));
  const observer = createObserver(sync);
  observer.observe(subtitle, { childList: true, characterData: true, subtree: true });
  sync();

  return () => {
    observer.disconnect();
    controller.setNarrationActive(false);
  };
}

interface ActiveSound {
  cue: SoundCue;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Web Audio implementation kept outside engine/** to respect lane ownership. */
export class BrowserSoundPlayback implements SoundPlaybackPort {
  private context: AudioContext | null = null;
  private buses = new Map<SoundBus, GainNode>();
  private active = new Set<ActiveSound>();
  private buffers = new Map<string, AudioBuffer | null>();
  private loadGeneration = 0;
  private narrationActive = false;
  private paused = false;

  ensure(): void {
    if (!this.context) {
      this.context = new AudioContext();
      for (const busName of soundDesignPlan.policy.generatedBuses) {
        const bus = this.context.createGain();
        bus.connect(this.context.destination);
        this.buses.set(busName, bus);
      }
    }
    if (this.context.state === "suspended" && !this.paused) void this.context.resume();
  }

  play(cue: SoundCue, asset: SoundAsset): void {
    this.ensure();
    const generation = this.loadGeneration;
    void this.load(asset.file).then((buffer) => {
      if (!buffer || generation !== this.loadGeneration || !this.context) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const target = dbToGain(cue.gainDb + (this.narrationActive ? cue.duckUnderNarrationDb : 0));
      source.buffer = buffer;
      source.loop = cue.loop;
      source.connect(gain);
      gain.connect(this.buses.get(cue.bus)!);
      gain.gain.setValueAtTime(cue.fadeInMs > 0 ? 0 : target, this.context.currentTime);
      if (cue.fadeInMs > 0) {
        gain.gain.linearRampToValueAtTime(target, this.context.currentTime + cue.fadeInMs / 1000);
      }
      const active = { cue, source, gain };
      this.active.add(active);
      source.onended = () => this.active.delete(active);
      source.start();
    });
  }

  stopCue(cueId: string, fadeOutMs: number): void {
    this.stopWhere((sound) => sound.cue.id === cueId, fadeOutMs);
  }

  stopBuses(buses: readonly SoundBus[], fadeOutMs: number): void {
    const selected = new Set(buses);
    this.stopWhere((sound) => selected.has(sound.cue.bus), fadeOutMs);
  }

  stopAll(fadeOutMs = 0): void {
    this.loadGeneration++;
    this.stopWhere(() => true, fadeOutMs);
  }

  setNarrationActive(active: boolean): void {
    this.narrationActive = active;
    if (!this.context) return;
    for (const sound of this.active) {
      const target = dbToGain(
        sound.cue.gainDb + (active ? sound.cue.duckUnderNarrationDb : 0)
      );
      sound.gain.gain.setTargetAtTime(target, this.context.currentTime, 0.15);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.context) return;
    if (paused && this.context.state === "running") void this.context.suspend();
    if (!paused && this.context.state === "suspended") void this.context.resume();
  }

  async dispose(): Promise<void> {
    this.stopAll();
    const context = this.context;
    this.context = null;
    this.buses.clear();
    this.buffers.clear();
    if (context && context.state !== "closed") await context.close();
  }

  private async load(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file)!;
    try {
      const response = await fetch(`/assets/audio/${file}`);
      if (!response.ok) throw new Error(String(response.status));
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(file, buffer);
      return buffer;
    } catch (error) {
      console.warn(`[sound-design] missing asset ${file}:`, error);
      this.buffers.set(file, null);
      return null;
    }
  }

  private stopWhere(predicate: (sound: ActiveSound) => boolean, fadeOutMs: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const sound of [...this.active]) {
      if (!predicate(sound)) continue;
      this.active.delete(sound);
      try {
        sound.gain.gain.cancelScheduledValues(now);
        sound.gain.gain.setValueAtTime(sound.gain.gain.value, now);
        if (fadeOutMs > 0) sound.gain.gain.linearRampToValueAtTime(0, now + fadeOutMs / 1000);
        sound.source.stop(now + fadeOutMs / 1000);
      } catch {
        // Source may have reached its natural end between selection and stop.
      }
    }
  }
}

/**
 * Remove only adapter-owned ambience from the in-memory manifests. The JSON
 * files remain untouched, avoiding conflicts with active scene lanes.
 */
export function claimAdapterAmbience(scenes: readonly SceneManifest[]): void {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  for (const scenePlan of soundDesignPlan.scenes) {
    const owned = new Set(
      scenePlan.cues
        .filter((cue) => cue.kind === "ambience" && cue.runtimeOwner === "adapter" && cue.asset)
        .map((cue) => `/assets/audio/${cue.asset}`)
    );
    if (!owned.size) continue;
    const manifest = byId.get(scenePlan.id);
    if (!manifest?.audio.ambience) continue;
    manifest.audio.ambience = manifest.audio.ambience.filter((asset) => !owned.has(asset));
  }
}

