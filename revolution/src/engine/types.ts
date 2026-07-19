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
}

export interface Cue {
  id: string;
  trigger: CueTrigger;
  /** VO file path relative to /audio — defaults to vo/<ID>.mp3 when subtitle text exists */
  vo?: string;
  subtitle?: string;
  /** diegetic line (spatialized, separate voice) rather than narrator */
  diegetic?: boolean;
  /** a cast diegetic line that plays BEFORE this cue's narrator line —
   *  vo.mjs emits these as `<CUE-ID>.<speaker>.mp3` (e.g. DEL-020.mariner) */
  diegeticVo?: string;
  diegeticSubtitle?: string;
  once?: boolean;
  /** bus names to duck while this cue plays */
  duck?: string[];
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
    /** repeatable diegetic bark pool, played at random intervals (vo.mjs
     *  emits `<SCENE>-BARK-N.mp3`) */
    barks?: string[];
  };
  /** scripted world-model beats: seconds into the scene -> model-event name + steering prompt */
  modelEvents?: { at: number; name: string; prompt?: string }[];
  next?: { scene: string; preloadAt?: string };
}
