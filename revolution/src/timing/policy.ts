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

export interface VoiceBearingCue {
  subtitle?: string;
  vo?: string;
  diegetic?: boolean;
  diegeticVo?: string;
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

export function firstVoiceKindForCue(cue: VoiceBearingCue): VoiceKind | null {
  if (cue.diegeticVo || cue.diegetic) return "diegetic";
  return cue.subtitle || cue.vo ? "narrator" : null;
}

export function finalVoiceKindForCue(cue: VoiceBearingCue): VoiceKind | null {
  if (!cue.diegetic && (cue.subtitle || cue.vo)) return "narrator";
  return cue.diegetic || cue.diegeticVo ? "diegetic" : null;
}
