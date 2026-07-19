import type {
  BarkDef,
  BeatNavigationRequest,
  BeatNavigationResult,
  BeatNavigationSnapshot,
  ControlHandoffDetail,
  ContextualChoiceRequest,
  ContextualChoiceSnapshot,
  Cue,
  EngineEvent,
  ListenerPose,
  RuntimePauseDetail,
  SceneManifest,
} from "./types";
import { CueEngine } from "./cues";
import { AudioEngine, type BusName } from "./audio";
import { assetExists, preloadSceneAssets } from "./assets";
import { loadState, markSceneComplete, setCurrentScene } from "./state";
import { scenes, sceneById } from "../scenes";
import { SplatScene } from "../renderers/splat";
import { WorldModelScenePlayer } from "../renderers/worldmodel";
import { prewarmDirectiveAt, WorldModelPrewarmController } from "./worldmodel-prewarm";
import { splitChapterHeading } from "../shell";
import { renderStallHint, StallHintTimer } from "./stall";
import { PausableTimeouts } from "./timers";
import {
  BranchRuntimeController,
  type BranchActionRequest,
  type BranchRuntimeSnapshot,
} from "./branch-runtime";
import {
  adjacentBeat,
  beatAvailability,
  canonicalNarrativeBeats,
  executeBeatTransition,
  type NarrativeBeat,
} from "./beat-navigation";
import {
  InteractionGate,
  configureLoadingSemantics,
  restartPausedScene,
  restoreFocus,
  setBackgroundInert,
  setPauseDialogView,
  trapFocus,
} from "./pause";

/** What the director needs from any scene surface. */
interface Runner {
  dispose(): void | Promise<void>;
  setControlsLocked(locked: boolean): void;
  hasMovementInput?(): boolean;
  /** Whether the currently presented runner can reclaim pointer input. */
  canResumePointerInput?(): boolean;
  setPaused(paused: boolean): void;
  /** current rendered frame, for splat -> world-model conditioning */
  captureFrame?(): Promise<Blob | null>;
  getAudioListenerPose?(): ListenerPose;
  requestBranchAction?(request: BranchActionRequest): Promise<void>;
  clearPersistentInput?(reason: string): void | Promise<void>;
}

export type DirectorExitTarget = "title" | "chapters" | "settings";
export type EngineEventObserver = (event: EngineEvent, sceneId: string) => void;

export interface DirectorOptions {
  container: HTMLElement;
  onExit: (target?: DirectorExitTarget) => void;
  onEngineEvent?: EngineEventObserver;
  onControlHandoff?: (detail: ControlHandoffDetail) => void;
  onContextualChoiceSnapshot?: (snapshot: ContextualChoiceSnapshot) => void;
  onBeatNavigationSnapshot?: (snapshot: BeatNavigationSnapshot) => void;
  onBeatNavigationResult?: (result: BeatNavigationResult) => void;
  onPauseState?: (detail: RuntimePauseDetail) => void;
  reviewMode?: boolean;
}

const CHAPTER_WORDS = [
  "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
];

export function runnerHasMovementInput(
  runner: { hasMovementInput?(): boolean } | null
): boolean {
  return runner?.hasMovementInput?.() === true;
}

export function runnerCanResumePointerInput(
  runner: { canResumePointerInput?(): boolean } | null
): boolean {
  return runner?.canResumePointerInput?.() === true;
}

export function activeRunnerCanResumePointerInput(
  renderer: ControlHandoffDetail["renderer"] | null,
  runner: { canResumePointerInput?(): boolean } | null
): boolean {
  return (renderer === "splat" || renderer === "worldmodel")
    && runnerCanResumePointerInput(runner);
}

export function completeCutsceneHandoff(emitAftermath: () => void, unlock: () => void) {
  emitAftermath();
  unlock();
}

/** Stable fan-out seam for non-story reactions such as event-driven SFX.
 * The cue engine remains authoritative; observers cannot suppress the event. */
export function dispatchEngineEvent(
  event: EngineEvent,
  consume: ((event: EngineEvent) => void) | undefined,
  observe: EngineEventObserver | undefined,
  sceneId: string | undefined
): void {
  consume?.(event);
  if (sceneId) observe?.(event, sceneId);
}

export function canPrewarmWorldModelTarget(
  target: SceneManifest | undefined,
  strategy: NonNullable<SceneManifest["livePrewarm"]>[number]["strategy"]
): target is SceneManifest {
  return !!target && (strategy === "transport" || target.renderer === "worldmodel");
}

export function controlHandoffForScene(
  sceneId: string,
  transitionKey: number,
  detail: Omit<ControlHandoffDetail, "sceneId" | "transitionKey">
): ControlHandoffDetail {
  return { sceneId, transitionKey, ...detail };
}

const SYSTEM_ACTIONS = new Set([
  "boarded",
  "control-granted",
  "cutscene-volley-complete",
  "signature-dwell",
]);

export function defaultGuidanceForCue(cue: Cue): string | null {
  const trigger = cue.trigger;
  const place = trigger.zone?.replaceAll("-", " ");
  switch (trigger.type) {
    case "zone-enter": return place ? `Walk toward the ${place} to continue` : "Keep exploring to continue";
    case "dwell": return place ? `Pause near the ${place} to continue` : "Pause and take in the scene";
    case "action": return trigger.name && SYSTEM_ACTIONS.has(trigger.name)
      ? null
      : "Interact with the scene to continue";
    case "model-event": return "Keep moving — the next moment is beginning";
    case "timer": return "The next moment will continue shortly";
    default: return null;
  }
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
  private paused = false;
  private sceneReady = false;
  private disposed = false;
  private activeCutscene: HTMLVideoElement | null = null;
  private finishActiveCutscene: ((cancelled?: boolean) => void) | null = null;
  private sceneTimers = new PausableTimeouts();
  private stallTimer: StallHintTimer;
  private stallCleanup: (() => void) | null = null;
  private stallMessage = "";
  private guidanceCancel: (() => void) | null = null;
  private focusBeforePause: HTMLElement | null = null;
  private sceneBackground: HTMLElement[] = [];
  private reviewTransitioning = false;
  private controlTransitionKey = 0;
  private activeRenderer: ControlHandoffDetail["renderer"] | null = null;
  private worldModelPrewarm = new WorldModelPrewarmController({
    onTelemetry: (event) => console.debug("[worldmodel:telemetry]", event),
  });
  private branchRuntime: BranchRuntimeController;
  private readonly narrativeBeats = canonicalNarrativeBeats(scenes);
  private activeBeat: NarrativeBeat | null = null;
  private beatTransitioning = false;
  private beatFeedback: Extract<BeatNavigationResult, { outcome: "clamped" | "error" }> | null = null;
  private beatNavigationPromise: Promise<BeatNavigationResult> | null = null;

  private stage: HTMLElement;
  private canvasHost: HTMLElement;
  private videoHost: HTMLElement;
  private subtitleEl: HTMLElement;
  private fadeEl: HTMLElement;
  private cardEl: HTMLElement;
  private statusEl: HTMLElement;
  private stallEl: HTMLElement;
  private guidanceEl: HTMLElement;
  private pauseEl: HTMLElement;
  private reviewControlsEl: HTMLElement | null;

  constructor(private opts: DirectorOptions) {
    opts.container.innerHTML = `
      <div class="stage">
        <div class="canvas-host"></div>
        <div class="video-host"></div>
        <div class="subtitle-bar"></div>
        <div class="fade-layer"></div>
        <div class="title-card">
          <p class="card-kicker"></p>
          <h2 class="card-title"></h2>
          <p class="card-date"></p>
          <p class="card-status"></p>
        </div>
        <p class="beat-guidance" aria-live="polite" aria-hidden="true"></p>
        <p class="stall-hint" aria-live="off" aria-hidden="true"></p>
        ${opts.reviewMode ? `
          <div class="review-controls" aria-label="Development review controls">
            <span>Review mode</span>
            <select data-review-scene aria-label="Scene to review">
              ${scenes.map((scene) => `<option value="${scene.id}">${splitChapterHeading(scene.title).title}</option>`).join("")}
            </select>
            <button data-review-action="jump">Go to scene</button>
            <button data-review-action="beat">Next beat</button>
            <button data-review-action="scene">Skip scene</button>
          </div>` : ""}
        <div class="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
          <section class="pause-panel">
            <div class="pause-menu">
              <p class="card-kicker">Story paused</p>
              <h2 id="pause-title">American Revolution</h2>
              <div class="pause-actions">
                <button data-pause-action="resume">Resume</button>
                <button class="secondary" data-pause-action="restart">Restart chapter</button>
                <button class="secondary" data-pause-action="chapters">Chapters</button>
                <button class="secondary" data-pause-action="settings">Settings</button>
              </div>
            </div>
            <div class="pause-settings-view" hidden>
              <p class="card-kicker">Preferences</p>
              <h2 id="pause-settings-title">Settings</h2>
              <div class="pause-settings-hook">
                <p>Display, subtitle, motion, and input preferences will appear here.</p>
              </div>
              <button class="secondary pause-settings-back" data-pause-action="settings-back">← Back</button>
            </div>
          </section>
        </div>
      </div>`;
    this.stage = opts.container.querySelector(".stage")!;
    this.canvasHost = this.stage.querySelector(".canvas-host")!;
    this.videoHost = this.stage.querySelector(".video-host")!;
    this.subtitleEl = this.stage.querySelector(".subtitle-bar")!;
    this.fadeEl = this.stage.querySelector(".fade-layer")!;
    this.cardEl = this.stage.querySelector(".title-card")!;
    this.statusEl = this.stage.querySelector(".card-status")!;
    this.guidanceEl = this.stage.querySelector(".beat-guidance")!;
    this.stallEl = this.stage.querySelector(".stall-hint")!;
    this.pauseEl = this.stage.querySelector(".pause-overlay")!;
    this.reviewControlsEl = this.stage.querySelector(".review-controls");
    this.branchRuntime = new BranchRuntimeController(window.localStorage, (snapshot) => {
      this.publishContextualChoice(snapshot);
    });
    configureLoadingSemantics(this.cardEl);
    setPauseDialogView(this.pauseEl, "menu");
    this.stallTimer = new StallHintTimer((visible) => {
      renderStallHint(this.stallEl, this.stallMessage, visible);
    });
    this.audio.onSubtitle = (text) => { this.subtitleEl.textContent = text ?? ""; };
    document.addEventListener("keydown", this.onPauseKeyDown);
    this.pauseEl.addEventListener("click", this.onPauseAction);
    this.reviewControlsEl?.addEventListener("click", this.onReviewAction);
  }

  /** Entry point — call from a user gesture (audio autoplay policy). */
  async start(sceneId: string) {
    this.audio.ensure();
    await this.runScene(sceneId);
  }

  // ---- scene lifecycle -------------------------------------------------

  private async runScene(id: string, startCueId?: string, skipTeardown = false) {
    if (this.reviewTransitioning) return;
    const manifest = sceneById.get(id);
    if (!manifest) throw new Error(`unknown scene "${id}"`);

    this.setReviewTransitioning(true);

    try {
      if (!skipTeardown) await this.teardownScene(id);
      await this.fadeTo(1);
      this.current = manifest;
      this.controlTransitionKey += 1;
      this.branchRuntime.enter(manifest.branching?.context ?? "out-of-range", (request) => {
        const runner = this.runner;
        if (!runner?.requestBranchAction) throw new Error("Branch action is not ready.");
        return runner.requestBranchAction(request);
      });
      this.emitControlHandoff({ renderer: manifest.renderer, controlsEnabled: false });
      setCurrentScene(manifest.id);
      const reviewSceneSelect = this.reviewControlsEl?.querySelector<HTMLSelectElement>("[data-review-scene]");
      if (reviewSceneSelect) reviewSceneSelect.value = manifest.id;

      const chapter = scenes.indexOf(manifest);
      const heading = splitChapterHeading(manifest.title);
      this.cardEl.querySelector(".card-kicker")!.textContent =
        chapter >= 0 ? `Chapter ${CHAPTER_WORDS[chapter] ?? chapter + 1}` : "";
      this.cardEl.querySelector(".card-title")!.textContent = heading.title;
      this.cardEl.querySelector(".card-date")!.textContent = heading.date;
      this.statusEl.textContent = "Preparing the chapter";
      this.cardEl.classList.add("visible");

      const cueEngine = new CueEngine(manifest.cues, {
        play: async (cue) => {
          this.setActiveBeat(manifest.id, cue.id);
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
        after: async (cue) => {
          if (this.cueEngine !== cueEngine) return;
          await this.runThen(cue);
          const staysInScene = !cue.then || !cue.then.startsWith("scene:") && cue.then !== "end";
          if (staysInScene && this.cueEngine === cueEngine && !cueEngine.hasQueuedPlayback()) {
            this.armBeatGuidance(cueEngine);
          }
        },
        action: (cue) => {
          this.hideBeatGuidance();
          if (cue.lockControls) this.runner?.setControlsLocked(true);
          if (manifest.next?.preloadAt === cue.id) this.preloadNext(manifest);
          const livePrewarm = prewarmDirectiveAt(manifest, cue.id);
          if (livePrewarm) this.prewarmWorldModel(livePrewarm);
        },
      });
      this.cueEngine = cueEngine;
      this.updateTimer = window.setInterval(() => {
        if (!this.paused) {
          cueEngine.update(0.1);
          const pose = this.runner?.getAudioListenerPose?.();
          if (pose) this.audio.setListenerPose(pose);
        }
      }, 100);

      if (manifest.audio.ambience?.length) void this.audio.playAmbience(manifest.audio.ambience);
      // narration over black is the loading screen — start the scene now
      if (startCueId) cueEngine.startAt(startCueId);
      else this.emitEngineEvent({ type: "scene-start" });

      const minHold = new Promise((r) => setTimeout(r, 2500));
      await Promise.all([this.createRunner(manifest), minHold]);
      // a scene with no preloadAt marker still preloads, just later
      if (manifest.next && !manifest.next.preloadAt) this.preloadNext(manifest);
      if (manifest.audio.barks?.length) this.startBarks(manifest.audio.barks);

      this.cardEl.classList.remove("visible");
      await this.fadeTo(0);
      this.sceneReady = true;
      this.publishBeatNavigation();
      this.publishContextualChoice();
      if (manifest.renderer === "splat") {
        this.emitControlHandoff({
          renderer: "splat",
          controlsEnabled: true,
          movement: { binding: "WASD", label: "Move" },
          look: { binding: "Mouse", label: "Look" },
        });
      } else if (manifest.renderer === "gameplay") {
        this.emitControlHandoff({
          renderer: "gameplay",
          controlsEnabled: true,
        });
      }
      this.armStallHint(manifest.renderer);
    } catch (error) {
      await this.worldModelPrewarm.cancel("scene-failure");
      throw error;
    } finally {
      this.setReviewTransitioning(false);
      this.publishBeatNavigation();
    }
  }

  private setReviewTransitioning(transitioning: boolean) {
    if (!this.opts.reviewMode) return;
    this.reviewTransitioning = transitioning;
    for (const control of this.reviewControlsEl?.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select") ?? []) {
      control.disabled = transitioning;
    }
  }

  private preloadNext(manifest: SceneManifest) {
    const next = manifest.next && sceneById.get(manifest.next.scene);
    if (next) preloadSceneAssets(next);
  }

  private emitEngineEvent(event: EngineEvent): void {
    dispatchEngineEvent(
      event,
      (next) => this.cueEngine?.handleEvent(next),
      this.opts.onEngineEvent,
      this.current?.id
    );
  }

  private emitControlHandoff(
    detail: Omit<ControlHandoffDetail, "sceneId" | "transitionKey">
  ): void {
    if (!this.current) return;
    this.activeRenderer = detail.renderer;
    this.opts.onControlHandoff?.(
      controlHandoffForScene(
        this.current.id,
        this.controlTransitionKey,
        detail,
      )
    );
  }

  /** Edge-only #50 seam. The returned promise means the command was sent,
   * never that the choice succeeded; confirmed snapshots are authoritative. */
  async requestContextualChoice(request: ContextualChoiceRequest) {
    return this.branchRuntime.request(request);
  }

  getContextualChoiceSnapshot(): ContextualChoiceSnapshot | null {
    if (!this.current) return null;
    return this.contextualChoiceSnapshot(this.branchRuntime.snapshot());
  }

  /** Full-story restart hook for the separately owned shell adapter. */
  resetBranchChoices(): void {
    this.branchRuntime.restartStory();
  }

  private contextualChoiceSnapshot(snapshot: BranchRuntimeSnapshot): ContextualChoiceSnapshot {
    const { presentation } = snapshot;
    const selectionAcknowledgement = snapshot.lastHandoff?.outcome === "latched"
      ? snapshot.lastHandoff.acknowledgement
      : null;
    return {
      sceneId: this.current?.id ?? "",
      transitionKey: this.controlTransitionKey,
      momentId: presentation.momentId,
      objective: presentation.objective,
      actions: presentation.actions,
      ready: snapshot.ready && this.sceneReady && !this.paused && !this.beatTransitioning,
      selectedChoiceId: presentation.selectedChoiceId,
      latchedChoiceId: presentation.latchedChoiceId,
      acknowledgement: selectionAcknowledgement ?? presentation.acknowledgement,
      commandError: snapshot.commandError,
    };
  }

  private publishContextualChoice(snapshot = this.branchRuntime.snapshot()): void {
    if (!this.current) return;
    this.opts.onContextualChoiceSnapshot?.(this.contextualChoiceSnapshot(snapshot));
  }

  getBeatNavigationSnapshot(): BeatNavigationSnapshot | null {
    if (!this.current) return null;
    const availability = beatAvailability(this.narrativeBeats, this.activeBeat);
    return {
      sceneId: this.current.id,
      transitionKey: this.controlTransitionKey,
      active: this.sceneReady && !this.paused && !this.disposed && !this.beatTransitioning,
      nextAvailable: availability.next,
      previousAvailable: availability.previous,
      feedback: this.beatFeedback,
    };
  }

  async nextBeat(request: BeatNavigationRequest): Promise<BeatNavigationResult> {
    return this.navigateBeat("next", request);
  }

  async previousBeat(request: BeatNavigationRequest): Promise<BeatNavigationResult> {
    return this.navigateBeat("previous", request);
  }

  private navigateBeat(
    direction: "next" | "previous",
    request: BeatNavigationRequest,
  ): Promise<BeatNavigationResult> {
    if (this.beatNavigationPromise) {
      const result: BeatNavigationResult = {
        outcome: "error",
        request,
        message: "A beat transition is already in progress.",
      };
      this.beatFeedback = result;
      this.opts.onBeatNavigationResult?.(result);
      this.publishBeatNavigation();
      return Promise.resolve(result);
    }
    const expectedType = direction === "next" ? "nextBeat" : "previousBeat";
    if (
      request.type !== expectedType
      || request.sceneId !== this.current?.id
      || request.transitionKey !== this.controlTransitionKey
    ) {
      const result: BeatNavigationResult = {
        outcome: "error",
        request,
        message: "The beat navigation request is stale.",
      };
      this.beatFeedback = result;
      this.opts.onBeatNavigationResult?.(result);
      this.publishBeatNavigation();
      return Promise.resolve(result);
    }
    const target = adjacentBeat(this.narrativeBeats, this.activeBeat, direction);
    if (!target) {
      const result: BeatNavigationResult = {
        outcome: "clamped",
        request,
        message: direction === "next" ? "This is the final beat." : "This is the first beat.",
      };
      this.beatFeedback = result;
      this.opts.onBeatNavigationResult?.(result);
      this.publishBeatNavigation();
      return Promise.resolve(result);
    }

    this.beatTransitioning = true;
    this.beatFeedback = null;
    this.publishBeatNavigation();
    this.publishContextualChoice();
    const from = this.activeBeat;
    this.beatNavigationPromise = executeBeatTransition(target, {
      cleanup: () => this.teardownScene(target.sceneId),
      enter: (beat) => this.runScene(beat.sceneId, beat.cueId, true),
    }).then(() => {
      const result: BeatNavigationResult = { outcome: "navigated", request };
      this.opts.onBeatNavigationResult?.(result);
      return result;
    }).catch((error) => {
      const result: BeatNavigationResult = {
        outcome: "error",
        request,
        message: error instanceof Error ? error.message : String(error),
      };
      this.activeBeat = from;
      this.beatFeedback = result;
      this.opts.onBeatNavigationResult?.(result);
      return result;
    }).finally(() => {
      this.beatTransitioning = false;
      this.beatNavigationPromise = null;
      this.publishBeatNavigation();
      this.publishContextualChoice();
    });
    return this.beatNavigationPromise;
  }

  private setActiveBeat(sceneId: string, cueId: string): void {
    this.activeBeat = this.narrativeBeats.find((beat) => beat.sceneId === sceneId && beat.cueId === cueId) ?? null;
    this.beatFeedback = null;
    this.publishBeatNavigation();
  }

  private publishBeatNavigation(): void {
    const snapshot = this.getBeatNavigationSnapshot();
    if (snapshot) this.opts.onBeatNavigationSnapshot?.(snapshot);
  }

  private prewarmWorldModel(directive: NonNullable<SceneManifest["livePrewarm"]>[number]) {
    const target = sceneById.get(directive.target);
    if (!canPrewarmWorldModelTarget(target, directive.strategy)) {
      console.warn(`[director] invalid live prewarm target "${directive.target}"`);
      return;
    }
    void this.worldModelPrewarm.prewarm({
      scene: target,
      strategy: directive.strategy,
      ttlMs: directive.ttlMs,
    });
  }

  private async teardownScene(preservePrewarmFor?: string) {
    this.sceneReady = false;
    this.publishBeatNavigation();
    this.branchRuntime.clearTransient();
    if (this.current) this.emitControlHandoff({ renderer: this.current.renderer, controlsEnabled: false });
    this.disarmStallHint();
    this.hideBeatGuidance();
    this.sceneTimers.cancelAll();
    this.finishActiveCutscene?.(true);
    this.finishActiveCutscene = null;
    this.activeCutscene = null;
    this.cueEngine?.stop();
    this.cueEngine = null;
    if (this.updateTimer !== null) { clearInterval(this.updateTimer); this.updateTimer = null; }
    for (const fn of this.teardownFns.splice(0)) fn();
    this.audio.stopAll();
    await this.runner?.clearPersistentInput?.("scene-teardown");
    await this.runner?.dispose();
    this.runner = null;
    if (preservePrewarmFor) {
      await this.worldModelPrewarm.cancelUnlessTarget(preservePrewarmFor, "route-changed");
    } else {
      await this.worldModelPrewarm.cancel("scene-teardown");
    }
    this.canvasHost.innerHTML = "";
    this.videoHost.innerHTML = "";
    this.videoHost.classList.remove("visible");
  }

  /** Ends the whole run (menu return). */
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.publishBeatNavigation();
    document.removeEventListener("keydown", this.onPauseKeyDown);
    this.pauseEl.removeEventListener("click", this.onPauseAction);
    this.reviewControlsEl?.removeEventListener("click", this.onReviewAction);
    await this.teardownScene();
    await this.audio.dispose();
  }

  private onPauseKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Tab" && this.paused) {
      if (trapFocus(this.pauseEl, document.activeElement, event.shiftKey)) event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (event.code === "KeyP" && typing) return;
    if (!["Escape", "KeyP"].includes(event.code) || !this.sceneReady || !this.current) return;
    event.preventDefault();
    void this.setPaused(!this.paused);
  };

  private onPauseAction = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-pause-action]");
    if (!button) return;
    switch (button.dataset.pauseAction) {
      case "resume":
        void this.setPaused(false);
        break;
      case "restart":
        void this.restartCurrent();
        break;
      case "chapters":
        void this.exitTo("chapters");
        break;
      case "settings":
        this.openPauseSettings();
        break;
      case "settings-back":
        this.closePauseSettings(true);
        break;
    }
  };

  private onReviewAction = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-review-action]");
    if (!button || !this.opts.reviewMode) return;
    event.preventDefault();
    switch (button.dataset.reviewAction) {
      case "beat":
        this.hideBeatGuidance();
        this.cueEngine?.fireNextPending();
        break;
      case "scene": {
        const next = this.current?.next && sceneById.get(this.current.next.scene);
        if (next) void this.runScene(next.id);
        else void this.exitTo("chapters");
        break;
      }
      case "jump": {
        const sceneId = this.reviewControlsEl
          ?.querySelector<HTMLSelectElement>("[data-review-scene]")?.value;
        if (sceneId && sceneById.has(sceneId)) void this.runScene(sceneId);
        break;
      }
    }
  };

  private async setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.publishBeatNavigation();
    this.publishContextualChoice();
    this.pauseEl.hidden = !paused;
    this.runner?.setPaused(paused);
    this.opts.onPauseState?.({
      paused,
      canResumePointerInput: activeRunnerCanResumePointerInput(this.activeRenderer, this.runner),
    });

    if (paused) {
      this.focusBeforePause = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      this.sceneBackground = Array.from(this.stage.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.pauseEl);
      setBackgroundInert(this.sceneBackground, true);
      this.disarmStallHint();
      this.sceneTimers.pause();
      this.activeCutscene?.pause();
      if (document.pointerLockElement) document.exitPointerLock();
      await this.audio.pause();
      this.pauseEl.querySelector<HTMLButtonElement>('[data-pause-action="resume"]')?.focus();
      return;
    }

    this.closePauseSettings();
    // Resume is a direct click gesture, so Witness scenes may reclaim pointer
    // lock without a second click. Browsers that decline simply resume with
    // the next click, which the renderer already handles.
    await this.audio.resume();
    this.sceneTimers.resume();
    if (this.activeCutscene?.paused) void this.activeCutscene.play().catch(() => undefined);
    setBackgroundInert(this.sceneBackground, false);
    this.sceneBackground = [];
    if (this.current) this.armStallHint(this.current.renderer);
    restoreFocus(this.focusBeforePause);
    this.focusBeforePause = null;
  }

  private openPauseSettings() {
    this.pauseEl.querySelector<HTMLElement>(".pause-menu")!.hidden = true;
    const view = this.pauseEl.querySelector<HTMLElement>(".pause-settings-view")!;
    view.hidden = false;
    setPauseDialogView(this.pauseEl, "settings");
    const container = view.querySelector<HTMLElement>(".pause-settings-hook")!;
    window.dispatchEvent(new CustomEvent("revolution:settings-open", {
      detail: { container },
    }));
    view.querySelector<HTMLButtonElement>('[data-pause-action="settings-back"]')?.focus();
  }

  private closePauseSettings(focusMenu = false) {
    this.pauseEl.querySelector<HTMLElement>(".pause-menu")!.hidden = false;
    this.pauseEl.querySelector<HTMLElement>(".pause-settings-view")!.hidden = true;
    setPauseDialogView(this.pauseEl, "menu");
    if (focusMenu) {
      this.pauseEl.querySelector<HTMLButtonElement>('[data-pause-action="resume"]')?.focus();
    }
  }

  private async restartCurrent() {
    const id = this.current?.id;
    if (!id) return;
    await restartPausedScene({
      resetPauseUi: () => {
        this.pauseEl.hidden = true;
        this.closePauseSettings();
        this.focusBeforePause = null;
      },
      fadeOut: () => this.fadeTo(1),
      teardown: () => this.teardownScene(),
      releasePause: async () => {
        this.paused = false;
        setBackgroundInert(this.sceneBackground, false);
        this.sceneBackground = [];
        this.sceneTimers.resume();
        await this.audio.resume();
      },
      startScene: () => this.runScene(id),
    });
  }

  private async exitTo(target: DirectorExitTarget) {
    if (this.paused) {
      // Leaving a paused scene must not briefly resume its audio under the
      // transition. The director and its suspended context are discarded.
      this.paused = false;
      this.pauseEl.hidden = true;
      this.closePauseSettings();
      this.focusBeforePause = null;
    }
    await this.fadeTo(1);
    await this.dispose();
    this.opts.onExit(target);
  }

  /** The only in-scene chrome beyond subtitles. Activity immediately hides
   * the reminder and restarts its ten-second idle clock. */
  private armStallHint(renderer: SceneManifest["renderer"]) {
    this.disarmStallHint();
    this.stallMessage = renderer === "splat"
      ? "WASD to walk · Move the mouse to look"
      : renderer === "worldmodel"
        ? "WASD to move · Arrow keys to look"
        : "Use the objects in the scene to continue";

    const events: (keyof DocumentEventMap)[] = [
      "keydown", "pointermove", "pointerdown", "wheel", "touchstart",
    ];
    for (const event of events) document.addEventListener(event, this.stallTimer.activity, { passive: true });
    this.stallCleanup = () => {
      for (const event of events) document.removeEventListener(event, this.stallTimer.activity);
    };
    this.stallTimer.start();
  }

  private disarmStallHint() {
    this.stallTimer?.stop();
    this.stallCleanup?.();
    this.stallCleanup = null;
  }

  /** After narration finishes, tell the viewer what advances the next beat.
   * Unlike the idle reminder, this still appears while someone is actively
   * exploring, so movement cannot hide a progression dead end forever. */
  private armBeatGuidance(cueEngine: CueEngine) {
    this.hideBeatGuidance();
    const next = cueEngine.nextPendingCue();
    if (!next) return;
    const message = next.guidance ?? defaultGuidanceForCue(next);
    if (!message) return;
    this.guidanceCancel = this.sceneTimers.schedule(() => {
      if (this.cueEngine !== cueEngine || this.paused) return;
      this.guidanceEl.textContent = message;
      this.guidanceEl.classList.add("visible");
      this.guidanceEl.setAttribute("aria-hidden", "false");
    }, 3_000);
  }

  private hideBeatGuidance() {
    this.guidanceCancel?.();
    this.guidanceCancel = null;
    this.guidanceEl?.classList.remove("visible");
    this.guidanceEl?.setAttribute("aria-hidden", "true");
    if (this.guidanceEl) this.guidanceEl.textContent = "";
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
      let fallbackTimer = 0;
      let presented = false;
      const present = () => {
        if (presented) return;
        presented = true;
        clearTimeout(fallbackTimer);
        ready();
      };
      const scene = new SplatScene({
        container: this.canvasHost,
        manifest: effective,
        onEvent: (event) => this.emitEngineEvent(event),
        onReady: present,
      });
      // don't let a stalled download hold the title card forever
      fallbackTimer = window.setTimeout(() => {
        this.statusEl.textContent = "Continuing with the available scene";
        present();
      }, 12_000);
      let cueLocked = false;
      let paused = false;
      const applyControlLock = () => { scene.controlsLocked = cueLocked || paused; };
      this.runner = {
        dispose: () => {
          clearTimeout(fallbackTimer);
          scene.dispose();
        },
        setControlsLocked: (locked) => {
          cueLocked = locked;
          applyControlLock();
          if (!locked) this.armResumeWalk();
        },
        hasMovementInput: () => scene.hasMovementInput(),
        canResumePointerInput: () => true,
        setPaused: (value) => {
          paused = value;
          applyControlLock();
          if (!value) void this.canvasHost.requestPointerLock();
        },
        captureFrame: () => scene.captureFrame(),
        getAudioListenerPose: () => scene.getAudioListenerPose(),
      };
    });
  }

  private async createWorldModelRunner(
    manifest: SceneManifest,
    conditioningFrame?: Blob
  ): Promise<void> {
    const strategy = conditioningFrame ? "transport" : "conditioned";
    await this.worldModelPrewarm.cancelUnless(manifest.id, strategy, "strategy-changed");
    const preparedSession = await this.worldModelPrewarm.adopt(manifest.id, strategy);
    const player = new WorldModelScenePlayer({
      container: this.videoHost,
      manifest,
      conditioningFrame,
      preparedSession: preparedSession ?? undefined,
      onEvent: (event) => this.emitEngineEvent(event),
      onStatus: (status) => { this.statusEl.textContent = status; },
      onTelemetry: (event) => console.debug("[worldmodel:telemetry]", event),
      onControlHandoff: (detail) => this.emitControlHandoff(detail),
      getBranchActions: () => this.branchRuntime.snapshot().presentation.actions,
      onBranchActionRequest: (request) => { void this.requestContextualChoice(request); },
      onBranchRuntimeEvent: (event) => { this.branchRuntime.handle(event); },
      onBranchReadiness: (readiness) => { this.branchRuntime.setReadiness(readiness); },
      onBranchTransientReset: () => { this.branchRuntime.clearTransient(); },
    });
    this.videoHost.classList.add("visible");
    this.runner = {
      dispose: () => player.dispose(),
      setControlsLocked: (locked) => player.setControlsLocked(locked),
      canResumePointerInput: () => player.canResumePointerInput(),
      setPaused: (paused) => player.setPaused(paused),
      requestBranchAction: (request) => player.requestBranchAction(request),
      clearPersistentInput: (reason) => player.clearPersistentInput(reason),
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
    const gate = new InteractionGate();
    const buttons: HTMLButtonElement[] = [];
    const syncButtons = () => {
      for (const button of buttons) button.disabled = gate.locked;
    };
    for (const name of actions) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = name;
      button.addEventListener("click", () => gate.dispatch(() =>
        this.emitEngineEvent({ type: "action", name })
      ));
      buttons.push(button);
      actionsEl.appendChild(button);
    }
    this.canvasHost.appendChild(host);
    this.runner = {
      dispose: () => host.remove(),
      setControlsLocked: (locked) => {
        gate.setControlsLocked(locked);
        syncButtons();
      },
      setPaused: (paused) => {
        gate.setPaused(paused);
        syncButtons();
      },
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
    this.emitControlHandoff({ renderer: "cutscene", controlsEnabled: false });
    await this.fadeTo(1);
    let completed = true;
    if (await assetExists(url)) {
      completed = await new Promise<boolean>((done) => {
        const video = document.createElement("video");
        video.className = "cutscene-video";
        video.src = url;
        video.playsInline = true;
        this.videoHost.appendChild(video);
        this.videoHost.classList.add("visible");
        this.activeCutscene = video;
        let finished = false;
        const finish = (cancelled = false) => {
          if (finished) return;
          finished = true;
          if (this.activeCutscene === video) this.activeCutscene = null;
          if (this.finishActiveCutscene === finish) this.finishActiveCutscene = null;
          video.remove();
          done(!cancelled);
        };
        this.finishActiveCutscene = finish;
        video.addEventListener("ended", () => finish(false), { once: true });
        video.addEventListener("error", () => finish(false), { once: true });
        // start playback explicitly: if the gesture token has expired the
        // unmuted play() rejects — retry muted, and bail rather than hold
        // controls locked forever
        void video.play().catch(async () => {
          video.muted = true;
          try { await video.play(); } catch { finish(); }
        });
        this.fadeTo(0);
      });
      if (!completed) return;
      await this.fadeTo(1);
      this.videoHost.classList.remove("visible");
    } else {
      // stand-in: hold black for the beat length (sound design carries it)
      completed = await new Promise<boolean>((done) => {
        this.sceneTimers.schedule(() => done(true), 3000, () => done(false));
      });
      if (!completed) return;
    }
    await this.fadeTo(0);
    completeCutsceneHandoff(
      () => this.emitEngineEvent({ type: "action", name: `cutscene-${id}-complete` }),
      () => this.runner?.setControlsLocked(false)
    );
    if (this.current?.renderer === "splat") {
      this.emitControlHandoff({
        renderer: "splat",
        controlsEnabled: true,
        movement: { binding: "WASD", label: "Move" },
        look: { binding: "Mouse", label: "Look" },
      });
    }
  }

  /** Repeatable diegetic bark pool (mariner calls across the water):
   *  a random bark every 18–35 s, no subtitle, no ducking — texture. */
  private startBarks(barks: (string | BarkDef)[]) {
    const schedule = () => {
      const selected = barks[Math.floor(Math.random() * barks.length)];
      const bark = typeof selected === "string" ? { url: selected } : selected;
      const [minimum, maximum] = bark.intervalSeconds ?? [18, 35];
      this.sceneTimers.schedule(() => {
        void this.audio.playOneShot(
          bark.url,
          "diegetic",
          bark.position ? {
            position: bark.position,
            refDistance: bark.refDistance,
            maxDistance: bark.maxDistance,
            rolloffFactor: bark.rolloffFactor,
          } : undefined
        );
        schedule();
      }, (minimum + Math.random() * (maximum - minimum)) * 1000);
    };
    schedule();
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
      if (this.paused) return;
      cleanup();
      this.emitEngineEvent({ type: "action", name: "resume-walk" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) fire();
    };
    document.addEventListener("keydown", onKey);
    pollTimer = window.setInterval(() => {
      if (this.paused) return;
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
    this.emitControlHandoff({
      renderer: "splat",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
      look: { binding: "Mouse", label: "Look" },
    });
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

    this.sceneTimers.schedule(
      () => this.emitEngineEvent({ type: "action", name: "signature-dwell" }),
      10_000
    );
    this.teardownFns.push(() => overlay.remove());
  }

  private async endStory() {
    if (this.current) markSceneComplete(this.current.id);
    setCurrentScene(null);
    await this.fadeTo(1);
    await this.teardownScene();
    this.cardEl.querySelector(".card-kicker")!.textContent = "1773 – 1783";
    this.cardEl.querySelector(".card-title")!.textContent = "The Revolution";
    this.statusEl.textContent = "";
    this.cardEl.classList.add("visible");
    await new Promise((r) => setTimeout(r, 6000));
    this.cardEl.classList.remove("visible");
    await this.dispose();
    this.opts.onExit("title");
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
