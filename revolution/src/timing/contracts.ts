/** Timing fields authored by the scene lane. These mirror the engine's
 * runtime Cue/CueTrigger fields for tools that consume only timing contracts. */
export interface AuthoredCueTriggerTiming {
  /** Pause-aware delay from a matched normalized event to cue dispatch. */
  afterEventSeconds?: number;
}

export interface AuthoredCueTiming {
  /** Explicitly bypasses the normal inter-cue breathing gap. */
  interruption?: boolean;
}
