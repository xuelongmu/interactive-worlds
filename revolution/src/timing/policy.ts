export type VoiceKind = "diegetic" | "narrator";

export interface VoiceBoundary {
  previous: VoiceKind;
  next: VoiceKind;
  /** Interruptions are exceptional and must be explicitly authored. */
  interrupted?: boolean;
}

export interface VoiceSpacingPolicy {
  diegeticToNarratorMs: number;
  narratorToNarratorMs: number;
}

/** Perceived timing policy. Values live outside the engine so scene timing
 * remains independently auditable and configurable. */
export const PERCEIVED_TIMING_POLICY = Object.freeze({
  diegeticToNarratorMs: 750,
  narratorToNarratorMs: 500,
  maxUnapprovedDeadAirMs: 10_000,
  teaPartyCompletionTakeMs: 6_000,
  eventBusFadeMs: 500,
});

export function requiredVoiceGapMs(
  boundary: VoiceBoundary,
  policy: VoiceSpacingPolicy = PERCEIVED_TIMING_POLICY,
): number {
  if (boundary.interrupted) return 0;
  if (boundary.previous === "diegetic" && boundary.next === "narrator") {
    return policy.diegeticToNarratorMs;
  }
  if (boundary.previous === "narrator" && boundary.next === "narrator") {
    return policy.narratorToNarratorMs;
  }
  return 0;
}
