import assert from "node:assert/strict";
import test from "node:test";
import { PerceivedTimingTelemetry, summarizeTimingSamples } from "./telemetry.ts";

const sample = (overrides = {}) => ({
  id: "test-handoff",
  sceneId: "test-scene",
  from: "voice-complete",
  to: "audible-beat",
  gapMs: 500,
  ...overrides,
});

test("unapproved measured handoffs over ten seconds fail", () => {
  const summary = summarizeTimingSamples([
    sample({ id: "minimum", gapMs: 500 }),
    sample({ id: "ceiling", gapMs: 10_000 }),
    sample({ id: "post-cue-over", gapMs: 10_001 }),
    sample({ id: "interaction-over", from: "interaction-complete", gapMs: 10_001 }),
    sample({ id: "reactor-over", from: "reactor-beat-complete", gapMs: 10_001 }),
  ]);

  assert.equal(summary.minimumGapMs, 500);
  assert.equal(summary.maximumGapMs, 10_001);
  assert.deepEqual(summary.violations.map(({ id }) => id), [
    "post-cue-over",
    "interaction-over",
    "reactor-over",
  ]);
});

test("exploration and active Reactor duration are reported but not dead air", () => {
  const summary = summarizeTimingSamples([
    sample({
      id: "exploration",
      gapMs: 210_000,
      activity: { kind: "player-exploration", reason: "viewer controls the route" },
    }),
    sample({
      id: "reactor",
      gapMs: 150_000,
      activity: { kind: "active-reactor", reason: "scripted model sequence remains active" },
    }),
  ]);

  assert.equal(summary.measuredCount, 0);
  assert.equal(summary.activityCount, 2);
  assert.deepEqual(summary.violations, []);
});

test("silence above the ceiling requires explicit director approval metadata", () => {
  const summary = summarizeTimingSamples([
    sample({
      id: "approved-hold",
      gapMs: 12_000,
      approvedSilence: {
        approvedBy: "director",
        reference: "decision:test",
        reason: "visible authored hold",
      },
    }),
  ]);

  assert.equal(summary.approvedExceptionCount, 1);
  assert.deepEqual(summary.violations, []);
});

test("runtime recorder measures handoffs and teardown cancels stale pending work", () => {
  let now = 1_000;
  const telemetry = new PerceivedTimingTelemetry(() => now);
  telemetry.begin("tea:deck-clear", {
    sceneId: "teaparty",
    from: "reactor-beat-complete",
  });
  now = 7_500;
  assert.equal(telemetry.complete("tea:deck-clear", "audible-beat")?.gapMs, 6_500);

  telemetry.begin("stale", { sceneId: "teaparty", from: "voice-complete" });
  telemetry.cancelAll();
  now = 20_000;
  assert.equal(telemetry.complete("stale", "visible-beat"), undefined);
  assert.equal(telemetry.report().maximumGapMs, 6_500);
});
