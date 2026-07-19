import { PERCEIVED_TIMING_POLICY } from "./policy.ts";

export type HandoffPointKind =
  | "scene-start"
  | "interaction-complete"
  | "reactor-beat-complete"
  | "voice-complete"
  | "audible-beat"
  | "visible-beat";

export type NonDeadAirActivity = "active-reactor" | "player-exploration";

export interface TimingHandoffSample {
  id: string;
  sceneId: string;
  from: HandoffPointKind;
  to: HandoffPointKind;
  gapMs: number;
  /** These intervals are reported, but are not dead air by definition. */
  activity?: {
    kind: NonDeadAirActivity;
    reason: string;
  };
  /** Silence over the ceiling is allowed only with a traceable approval. */
  approvedSilence?: {
    approvedBy: "director";
    reference: string;
    reason: string;
  };
}

export interface TimingTelemetrySummary {
  measuredCount: number;
  activityCount: number;
  approvedExceptionCount: number;
  minimumGapMs: number | null;
  maximumGapMs: number | null;
  violations: TimingHandoffSample[];
  approvedExceptions: TimingHandoffSample[];
  activities: TimingHandoffSample[];
}

interface PendingTimingHandoff {
  sceneId: string;
  from: HandoffPointKind;
  startedAtMs: number;
  activity?: TimingHandoffSample["activity"];
  approvedSilence?: TimingHandoffSample["approvedSilence"];
}

/** Runtime-facing recorder for the focused engine follow-up. Navigation,
 * restart, failure, or disposal must call cancelAll() so stale operations can
 * never complete a handoff in the next scene. */
export class PerceivedTimingTelemetry {
  private pending = new Map<string, PendingTimingHandoff>();
  private samples: TimingHandoffSample[] = [];
  private now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  begin(
    id: string,
    handoff: Omit<PendingTimingHandoff, "startedAtMs">,
  ): void {
    this.pending.set(id, { ...handoff, startedAtMs: this.now() });
  }

  complete(id: string, to: HandoffPointKind): TimingHandoffSample | undefined {
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.pending.delete(id);
    const sample: TimingHandoffSample = {
      id,
      sceneId: pending.sceneId,
      from: pending.from,
      to,
      gapMs: Math.max(0, this.now() - pending.startedAtMs),
      ...(pending.activity ? { activity: pending.activity } : {}),
      ...(pending.approvedSilence ? { approvedSilence: pending.approvedSilence } : {}),
    };
    this.samples.push(sample);
    return sample;
  }

  cancelAll(): void {
    this.pending.clear();
  }

  report(): TimingTelemetrySummary {
    return summarizeTimingSamples(this.samples);
  }

  snapshot(): TimingHandoffSample[] {
    return this.samples.map((sample) => ({ ...sample }));
  }
}

export function summarizeTimingSamples(
  samples: TimingHandoffSample[],
  ceilingMs = PERCEIVED_TIMING_POLICY.maxUnapprovedDeadAirMs,
): TimingTelemetrySummary {
  const activities = samples.filter((sample) => sample.activity);
  const measured = samples.filter((sample) => !sample.activity);
  const approvedExceptions = measured.filter(
    (sample) => sample.gapMs > ceilingMs && sample.approvedSilence,
  );
  const violations = measured.filter(
    (sample) => sample.gapMs > ceilingMs && !sample.approvedSilence,
  );
  const gaps = measured.map((sample) => sample.gapMs);

  return {
    measuredCount: measured.length,
    activityCount: activities.length,
    approvedExceptionCount: approvedExceptions.length,
    minimumGapMs: gaps.length ? Math.min(...gaps) : null,
    maximumGapMs: gaps.length ? Math.max(...gaps) : null,
    violations,
    approvedExceptions,
    activities,
  };
}
