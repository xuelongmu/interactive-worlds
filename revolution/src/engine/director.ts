import type { Cue, EngineEvent, SceneManifest } from "./types";
import { CueEngine } from "./cues";
import { AudioEngine, type BusName } from "./audio";
import { assetExists, preloadSceneAssets } from "./assets";
import { loadState, markSceneComplete } from "./state";
import { scenes, sceneById } from "../scenes";
import { SplatScene } from "../renderers/splat";
import { WorldModelScenePlayer } from "../renderers/worldmodel";

/** What the director needs from any scene surface. */
interface Runner {
  dispose(): void | Promise<void>;
  setControlsLocked(locked: boolean): void;
  hasMovementInput?(): boolean;
  /** current rendered frame, for splat -> world-model conditioning */
  captureFrame?(): Promise<Blob | null>;
}

const CHAPTER_WORDS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
];

export function runnerHasMovementInput(
  runner: { hasMovementInput?(): boolean } | null
): boolean {
  return runner?.hasMovementInput?.() === true;
}

export function completeCutsceneHandoff(emitAftermath: () => void, unlock: () => void) {
  emitAftermath();
  unlock();
}

/** Runs the story: loads a manifest, instantiates its renderer, wires the
 *  cue + audio engines, and executes `then:` directives. Linear order makes
 *  prediction exact — the next scene preloads while the current one plays,
 *  and every transition is audio-first: the out-line narration finishes,
 *  then the visual cut lands under a fade + chapter title card that doubles
 *  as the honest loading screen (narration continues over black). */
export class Director {
  private audio = new AudioEngine();
  private cueEngine: CueEngine | null = null;
  private runner: Runner | null = null;
  private updateTimer: number | null = null;
  private current: SceneManifest | null = null;
  private teardownFns: (() => void)[] = [];

  private stage: HTMLElement;
  private canvasHost: HTMLElement;
  private videoHost: HTMLElement;
  private subtitleEl: HTMLElement;
  private fadeEl: HTMLElement;
  private cardEl: HTMLElement;
  private statusEl: HTMLElement;

  constructor(private opts: { container: HTMLElement; onExit: () => void }) {
    opts.container.innerHTML = `
      <div class="stage">
        <div class="canvas-host"></div>
        <div class="video-host"></div>
        <div class="subtitle-bar"></div>
        <div class="fade-layer"></div>
        <div class="title-card">
          <p class="card-kicker"></p>
          <h2 class="card-title"></h2>
          <p class="card-status"></p>
        </div>
      </div>`;
    this.stage = opts.container.querySelector(".stage")!;
    this.canvasHost = this.stage.querySelector(".canvas-host")!;
    this.videoHost = this.stage.querySelector(".video-host")!;
    this.subtitleEl = this.stage.querySelector(".subtitle-bar")!;
    this.fadeEl = this.stage.querySelector(".fade-layer")!;
    this.cardEl = this.stage.querySelector(".title-card")!;
    this.statusEl = this.stage.querySelector(".card-status")!;
    this.audio.onSubtitle = (text) => { this.subtitleEl.textContent = text ?? ""; };
  }

  /** Entry point — call from a user gesture (audio autoplay policy). */
  async start(sceneId: string) {
    this.audio.ensure();
    await this.runScene(sceneId);
  }

  // ---- scene lifecycle -------------------------------------------------

  private async runScene(id: string) {
    const manifest = sceneById.get(id);
    if (!manifest) throw new Error(`unknown scene "${id}"`);

    await this.fadeTo(1);
    await this.teardownScene();
    this.current = manifest;

    const chapter = scenes.indexOf(manifest);
    this.cardEl.querySelector(".card-kicker")!.textContent =
      chapter >= 0 ? `Chapter ${CHAPTER_WORDS[chapter] ?? chapter + 1}` : "";
    this.cardEl.querySelector(".card-title")!.textContent = manifest.title;
    this.statusEl.textContent = "";
    this.cardEl.classList.add("visible");

    const cueEngine = new CueEngine(manifest.cues, {
      play: async (cue) => {
        // cast diegetic line first (the script order: shout, then narrator)
        if (cue.diegeticVo) {
          await this.audio.playVoice({
            url: cue.diegeticVo,
            subtitle: cue.diegeticSubtitle,
            bus: "diegetic",
            duck: [],
          });
        }
        await this.audio.playVoice({
          url: cue.vo ?? `/assets/audio/vo/${cue.id}.mp3`,
          subtitle: cue.subtitle,
          bus: cue.diegetic ? "diegetic" : "narration",
          duck: cue.diegetic ? [] : cue.duck as BusName[] | undefined,
        });
      },
      // audio-first: the visual consequence lands on the last word — and a
      // failed VO load still advances the story
      after: (cue) => {
        if (this.cueEngine === cueEngine) void this.runThen(cue);
      },
      action: (cue) => {
        if (cue.lockControls) this.runner?.setControlsLocked(true);
        if (manifest.next?.preloadAt === cue.id) this.preloadNext(manifest);
      },
    });
    this.cueEngine = cueEngine;
    this.updateTimer = window.setInterval(() => cueEngine.update(0.1), 100);

    if (manifest.audio.ambience?.length) void this.audio.playAmbience(manifest.audio.ambience);
    // narration over black is the loading screen — start the scene now
    cueEngine.handleEvent({ type: "scene-start" });

    const minHold = new Promise((r) => setTimeout(r, 2500));
    await Promise.all([this.createRunner(manifest), minHold]);
    // a scene with no preloadAt marker still preloads, just later
    if (manifest.next && !manifest.next.preloadAt) this.preloadNext(manifest);
    if (manifest.audio.barks?.length) this.startBarks(manifest.audio.barks);

    this.cardEl.classList.remove("visible");
    await this.fadeTo(0);
  }

  private preloadNext(manifest: SceneManifest) {
    const next = manifest.next && sceneById.get(manifest.next.scene);
    if (next) preloadSceneAssets(next);
  }

  private async teardownScene() {
    this.cueEngine?.stop();
    this.cueEngine = null;
    if (this.updateTimer !== null) { clearInterval(this.updateTimer); this.updateTimer = null; }
    for (const fn of this.teardownFns.splice(0)) fn();
    this.audio.stopAmbience();
    await this.runner?.dispose();
    this.runner = null;
    this.canvasHost.innerHTML = "";
    this.videoHost.innerHTML = "";
    this.videoHost.classList.remove("visible");
  }

  /** Ends the whole run (menu return). */
  async dispose() {
    await this.teardownScene();
  }

  // ---- renderers -------------------------------------------------------

  private createRunner(manifest: SceneManifest): Promise<void> {
    switch (manifest.renderer) {
      case "splat": return this.createSplatRunner(manifest);
      case "worldmodel": return this.createWorldModelRunner(manifest);
      case "gameplay": return this.createGameplayRunner(manifest);
    }
  }

  private async createSplatRunner(manifest: SceneManifest): Promise<void> {
    // strip assets that haven't been generated yet so the renderer doesn't
    // chase 404s; zones + cues stay live either way
    const effective = structuredClone(manifest);
    if (effective.assets.splat && !(await assetExists(effective.assets.splat))) {
      this.statusEl.textContent = "world not generated yet — walking the empty stage";
      delete effective.assets.splat;
    }
    if (effective.assets.collider && !(await assetExists(effective.assets.collider))) {
      delete effective.assets.collider;
    }

    await new Promise<void>((ready) => {
      const scene = new SplatScene({
        container: this.canvasHost,
        manifest: effective,
        onEvent: (event) => this.cueEngine?.handleEvent(event),
        onReady: () => ready(),
      });
      // don't let a stalled download hold the title card forever
      setTimeout(ready, 12_000);
      this.runner = {
        dispose: () => scene.dispose(),
        setControlsLocked: (locked) => {
          scene.controlsLocked = locked;
          if (!locked) this.armResumeWalk();
        },
        hasMovementInput: () => scene.hasMovementInput(),
        captureFrame: () => scene.captureFrame(),
      };
    });
  }

  private async createWorldModelRunner(
    manifest: SceneManifest,
    conditioningFrame?: Blob
  ): Promise<void> {
    const player = new WorldModelScenePlayer({
      container: this.videoHost,
      manifest,
      conditioningFrame,
      onEvent: (event) => this.cueEngine?.handleEvent(event),
      onStatus: (status) => { this.statusEl.textContent = status; },
    });
    this.videoHost.classList.add("visible");
    this.runner = {
      dispose: () => player.dispose(),
      setControlsLocked: () => { /* live input mapping has no lock yet */ },
    };
    await player.start();
  }

  /** Actor-register scenes are separate issues (#3 signing, #10/#12 tables).
   *  Until they land, an honest placeholder keeps the story traversable:
   *  it renders the stage and exposes each action the manifest listens for. */
  private async createGameplayRunner(manifest: SceneManifest): Promise<void> {
    const host = document.createElement("div");
    host.className = "gameplay-placeholder";
    const actions = manifest.cues
      .filter((cue) => cue.trigger.type === "action" && cue.trigger.name)
      .map((cue) => cue.trigger.name!);
    host.innerHTML = `
      <p class="card-kicker">interaction placeholder</p>
      <h3>${manifest.title}</h3>
      <p class="dim">This scene's Actor-register interaction isn't built yet.
         Fire its beats by hand:</p>
      <div class="actions"></div>`;
    const actionsEl = host.querySelector(".actions")!;
    for (const name of actions) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = name;
      button.addEventListener("click", () =>
        this.cueEngine?.handleEvent({ type: "action", name })
      );
      actionsEl.appendChild(button);
    }
    this.canvasHost.appendChild(host);
    this.runner = {
      dispose: () => host.remove(),
      setControlsLocked: () => {},
    };
  }

  // ---- then: directives ------------------------------------------------

  private async runThen(cue: Cue) {
    if (!cue.then) return;
    const [verb, arg = ""] = cue.then.split(/:(.*)/, 2) as [string, string?];
    switch (verb) {
      case "scene":
        await this.advance(arg!);
        break;
      case "cutscene":
        await this.playCutscene(arg!);
        break;
      case "wake":
        await this.wakeWorldModel();
        break;
      case "settle":
        await this.settleToSplat();
        break;
      case "signature":
        this.showSignature();
        break;
      case "end":
        await this.endStory();
        break;
      default:
        console.warn(`[director] unknown then-directive "${cue.then}" on ${cue.id}`);
    }
  }

  private async advance(sceneId: string) {
    if (this.current) markSceneComplete(this.current.id);
    // don't chain the whole next scene into the old cue's play() promise
    void this.runScene(sceneId);
  }

  /** Full-screen pre-rendered video beat (e.g. the Lexington volley).
   *  Missing asset (not yet generated) degrades to a black hold so the
   *  scene grammar still plays. Emits `cutscene-<id>-complete`. */
  private async playCutscene(id: string) {
    const url = `/assets/video/${id}.mp4`;
    await this.fadeTo(1);
    if (await assetExists(url)) {
      await new Promise<void>((done) => {
        const video = document.createElement("video");
        video.className = "cutscene-video";
        video.src = url;
        video.playsInline = true;
        this.videoHost.appendChild(video);
        this.videoHost.classList.add("visible");
        const finish = () => { video.remove(); done(); };
        video.addEventListener("ended", finish, { once: true });
        video.addEventListener("error", finish, { once: true });
        // start playback explicitly: if the gesture token has expired the
        // unmuted play() rejects — retry muted, and bail rather than hold
        // controls locked forever
        void video.play().catch(async () => {
          video.muted = true;
          try { await video.play(); } catch { finish(); }
        });
        this.fadeTo(0);
      });
      await this.fadeTo(1);
      this.videoHost.classList.remove("visible");
    } else {
      // stand-in: hold black for the beat length (sound design carries it)
      await new Promise((r) => setTimeout(r, 3000));
    }
    await this.fadeTo(0);
    completeCutsceneHandoff(
      () => this.cueEngine?.handleEvent({ type: "action", name: `cutscene-${id}-complete` }),
      () => this.runner?.setControlsLocked(false)
    );
  }

  /** Repeatable diegetic bark pool (mariner calls across the water):
   *  a random bark every 18–35 s, no subtitle, no ducking — texture. */
  private startBarks(urls: string[]) {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void this.audio.playOneShot(urls[Math.floor(Math.random() * urls.length)], "diegetic");
        schedule();
      }, 18_000 + Math.random() * 17_000);
    };
    schedule();
    this.teardownFns.push(() => clearTimeout(timer));
  }

  /** First movement after an unlock -> generic `resume-walk` action.
   *  Polls held keys too: a player who kept W pressed through the cutscene
   *  resumes walking without a fresh keydown ever firing. */
  private armResumeWalk() {
    let pollTimer = 0;
    const cleanup = () => {
      document.removeEventListener("keydown", onKey);
      clearInterval(pollTimer);
    };
    const fire = () => {
      cleanup();
      this.cueEngine?.handleEvent({ type: "action", name: "resume-walk" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) fire();
    };
    document.addEventListener("keydown", onKey);
    pollTimer = window.setInterval(() => {
      const runner = this.runner;
      if (runnerHasMovementInput(runner)) fire();
    }, 250);
    this.teardownFns.push(cleanup);
  }

  /** Continuity trick: the frozen canvas frame becomes the world model's
   *  conditioning image, so the world "wakes up" in place (Tea Party
   *  boarding, the Saratoga charge, Redoubt 10). */
  private async wakeWorldModel() {
    if (!this.current) return;
    const frame = (await this.runner?.captureFrame?.()) ?? undefined;
    const frozen = this.runner;
    this.runner = null; // the player becomes the active runner
    await this.createWorldModelRunner(this.current, frame);
    await frozen?.dispose();
  }

  /** The reverse of wake: leave the video surface and settle onto this
   *  scene's splat (Yorktown surrender field). */
  private async settleToSplat() {
    if (!this.current) return;
    await this.fadeTo(1);
    const video = this.runner;
    this.runner = null;
    await video?.dispose();
    this.videoHost.innerHTML = "";
    this.videoHost.classList.remove("visible");
    await this.createSplatRunner(this.current);
    await this.fadeTo(0);
  }

  /** The Declaration signature, aged 47 years, under glass. Payoff is
   *  wordless — PAR-050 fires off the dwell action after ten seconds. */
  private showSignature() {
    const state = loadState();
    const overlay = document.createElement("div");
    overlay.className = "signature-overlay";
    overlay.innerHTML = `<canvas width="640" height="360"></canvas>`;
    this.stage.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const canvas = overlay.querySelector("canvas")!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#d8cdb4"; // aged parchment
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(74, 52, 30, 0.85)"; // iron gall ink, browned
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const strokes = state.signature ?? [];
    if (strokes.length === 0) {
      ctx.font = "italic 28px Georgia, serif";
      ctx.fillStyle = "rgba(74, 52, 30, 0.6)";
      ctx.textAlign = "center";
      ctx.fillText("— unsigned —", canvas.width / 2, canvas.height / 2);
    }
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => {
        const px = x * canvas.width;
        const py = y * canvas.height;
        // feathering: ink bleeding into old paper
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px + (Math.random() - 0.5) * 0.8, py + (Math.random() - 0.5) * 0.8);
      });
      ctx.stroke();
    }

    const timer = window.setTimeout(
      () => this.cueEngine?.handleEvent({ type: "action", name: "signature-dwell" }),
      10_000
    );
    this.teardownFns.push(() => { clearTimeout(timer); overlay.remove(); });
  }

  private async endStory() {
    if (this.current) markSceneComplete(this.current.id);
    await this.fadeTo(1);
    await this.teardownScene();
    this.cardEl.querySelector(".card-kicker")!.textContent = "1773 – 1783";
    this.cardEl.querySelector(".card-title")!.textContent = "The Revolution";
    this.statusEl.textContent = "";
    this.cardEl.classList.add("visible");
    await new Promise((r) => setTimeout(r, 6000));
    this.cardEl.classList.remove("visible");
    this.opts.onExit();
  }

  // ---- fade ------------------------------------------------------------

  private fadeTo(opacity: 0 | 1): Promise<void> {
    const el = this.fadeEl;
    if (getComputedStyle(el).opacity === String(opacity)) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { el.removeEventListener("transitionend", done); resolve(); };
      el.addEventListener("transitionend", done);
      setTimeout(done, 1000); // transitionend can be swallowed by tab switches
      el.style.opacity = String(opacity);
    });
  }
}
