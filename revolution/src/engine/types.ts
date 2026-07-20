import type {
  BranchAcknowledgement,
  BranchChoiceId,
  BranchMomentId,
  BranchObjective,
  BranchPresentationActions,
  BranchPresentationContext,
  BranchRequestId,
  BranchSelectionAcknowledgement,
} from "../branch-state";

/** Normalized event vocabulary. Every renderer emits these; the cue engine
 *  consumes them. This is the seam that keeps scenes renderer-agnostic. */
export type EngineEvent =
  | { type: "zone-enter"; zone: string }
  | { type: "zone-exit"; zone: string }
  | { type: "action"; name: string }        // gameplay interactions (quill-pickup, sign-complete, ...)
  | { type: "model-event"; name: string }   // scripted world-model beats (storm, landing, ...)
  | { type: "scene-start" };

export type TriggerType = EngineEvent["type"] | "timer" | "dwell";

export interface CueTrigger {
  type: TriggerType;
  /** zone id for zone-enter/dwell */
  zone?: string;
  /** action / model-event name */
  name?: string;
  /** seconds — for timer (from scene start) and dwell (time inside zone) */
  seconds?: number;
  /** fallback timer (seconds from scene start) that fires the cue even if the
   *  primary trigger never happens — e.g. LEX-060's 4-minute failsafe */
  orTimer?: number;
  /** Fallback delay after the preceding cue finishes. This keeps exploratory
   * scenes moving when a viewer misses an authored zone. */
  orAfterPrevious?: number;
  /** Pause-aware delay from a matched normalized event to cue dispatch. */
  afterEventSeconds?: number;
}

export interface Cue {
  id: string;
  trigger: CueTrigger;
  /** VO file path relative to /audio — defaults to vo/<ID>.mp3 when subtitle text exists */
  vo?: string;
  subtitle?: string;
  /** Short direction shown after the preceding voiceover while this cue is
   * still waiting for a viewer-triggered action. */
  guidance?: string;
  /** diegetic line (spatialized, separate voice) rather than narrator */
  diegetic?: boolean;
  /** a cast diegetic line that plays BEFORE this cue's narrator line —
   *  vo.mjs emits these as `<CUE-ID>.<speaker>.mp3` (e.g. DEL-020.mariner) */
  diegeticVo?: string;
  diegeticSubtitle?: string;
  once?: boolean;
  /** bus names to duck while this cue plays */
  duck?: string[];
  /** Sparse editorial music played only after this line finishes and before
   * any `then:` transition. Never place battle or source music here. */
  musicAfter?: string;
  /** Explicitly bypasses the normal inter-cue breathing gap. */
  interruption?: boolean;
  lockControls?: boolean;
  /** follow-up action for the director, e.g. "cutscene:volley", "scene:declaration" */
  then?: string;
}

export interface ZoneDef {
  id: string;
  shape: "box";
  /** center, meters */
  pos: [number, number, number];
  /** full extents, meters */
  size: [number, number, number];
}

export type WorldModelPrewarmStrategy = "conditioned" | "transport";

/** A late, explicit live-session preparation cue. This is deliberately
 * separate from `next.preloadAt`, which only warms static HTTP assets. */
export interface WorldModelPrewarmDirective {
  /** Cue whose action phase begins preparation. */
  at: string;
  /** Scene that may adopt the prepared session. */
  target: string;
  /** Prepare both conditions, or only the transport for a captured frame. */
  strategy: WorldModelPrewarmStrategy;
  /** Disconnect an unadopted session after this many milliseconds. */
  ttlMs?: number;
}

/** Runtime-only control availability. Presentation layers may translate this
 * callback into UI events without coupling the director to HUD markup. */
export interface ControlHandoffDetail {
  sceneId: string;
  renderer: "splat" | "worldmodel" | "gameplay" | "cutscene";
  controlsEnabled: boolean;
  movement?: { binding: string; label: string };
  look?: { binding: string; label: string };
  transitionKey: number;
}

export interface ContextualChoiceCommandError {
  readonly momentId: BranchMomentId;
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchRequestId;
  readonly message: string;
  readonly visible: true;
  readonly retryable: true;
}

/** Structurally matches the separately owned #50 HUD integration surface. */
export interface ContextualChoiceSnapshot {
  readonly sceneId: string;
  readonly transitionKey: number;
  readonly momentId: BranchMomentId | null;
  readonly objective: BranchObjective | null;
  readonly actions: BranchPresentationActions | null;
  readonly ready: boolean;
  readonly selectedChoiceId: BranchChoiceId | null;
  readonly latchedChoiceId: BranchChoiceId | null;
  readonly acknowledgement: BranchAcknowledgement | BranchSelectionAcknowledgement | null;
  readonly commandError: ContextualChoiceCommandError | null;
}

export interface ContextualChoiceRequest {
  readonly momentId: BranchMomentId;
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchRequestId;
}

export type ContextualChoiceRequestResult = Readonly<
  | { status: "requested"; requestId: BranchRequestId }
  | { status: "unavailable" | "duplicate" | "already-latched"; requestId: BranchRequestId }
  | { status: "invalid"; requestId: BranchRequestId | null; message: string }
>;

export interface BeatNavigationRequest {
  readonly type: "nextBeat" | "previousBeat";
  readonly sceneId: string;
  readonly transitionKey: number;
}

export type BeatNavigationResult = Readonly<
  | { outcome: "navigated"; request: BeatNavigationRequest }
  | { outcome: "clamped" | "error"; request: BeatNavigationRequest; message: string }
>;

export type BeatNavigationFeedback = Extract<BeatNavigationResult, { outcome: "clamped" | "error" }>;

export interface BeatNavigationSnapshot {
  readonly sceneId: string;
  readonly transitionKey: number;
  readonly active: boolean;
  readonly nextAvailable: boolean;
  readonly previousAvailable: boolean;
  readonly feedback: BeatNavigationFeedback | null;
}

export interface RuntimePauseDetail {
  paused: boolean;
  canResumePointerInput: boolean;
}

export interface ListenerPose {
  position: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
}

export interface BarkDef {
  url: string;
  /** Fixed source position in scene-local meters. Omit for non-spatial barks. */
  position?: [number, number, number];
  /** Random delay range before each repetition. Defaults to 18–35 seconds. */
  intervalSeconds?: [number, number];
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
}

export interface SceneManifest {
  id: string;
  title: string;
  renderer: "splat" | "worldmodel" | "gameplay";
  assets: {
    splat?: string;
    collider?: string;
    /** world-model conditioning */
    referenceImage?: string;
    prompt?: string;
    /** pre-rendered fallback for worldmodel scenes */
    fallbackVideo?: string;
  };
  /** eye height (m) and movement speed (m/s) for walkable scenes */
  locomotion?: { eyeHeight: number; speed: number };
  /** designed spawn orientation (radians yaw) — Marble worlds often have their
   *  content behind the capture origin's default view direction */
  entry?: { yaw?: number };
  zones: ZoneDef[];
  cues: Cue[];
  audio: {
    ambience?: string[];
    /** repeatable diegetic bark pool, optionally positioned in scene space */
    barks?: (string | BarkDef)[];
  };
  /** scripted world-model beats: seconds into the scene -> model-event name + steering prompt */
  modelEvents?: { at: number; name: string; prompt?: string }[];
  /** Historically convergent E/F choice or later non-narrative callback. */
  branching?: {
    context: BranchPresentationContext;
    actions?: readonly {
      choiceId: BranchChoiceId;
      heldPrompt: string;
      releasedPrompt: string;
    }[];
  };
  /** Billable live preparation policy, intentionally independent from static
   * asset preloading. Authored activation lives with the scene manifest. */
  livePrewarm?: WorldModelPrewarmDirective[];
  next?: { scene: string; preloadAt?: string };
}
