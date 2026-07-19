/** Timing fields authored by the scene lane. The focused runtime follow-up
 * extends the engine's Cue/CueTrigger types with these structural fields. */
export interface AuthoredCueTriggerTiming {
  /** Pause-aware delay from a matched normalized event to cue dispatch. */
  afterEventSeconds?: number;
}

export interface AuthoredCueTiming {
  /** Explicitly bypasses the normal inter-cue breathing gap. */
  interruption?: boolean;
}
