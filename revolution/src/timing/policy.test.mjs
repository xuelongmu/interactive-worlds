import assert from "node:assert/strict";
import test from "node:test";
import {
  PERCEIVED_TIMING_POLICY,
  requiredVoiceGapMs,
} from "./policy.ts";

test("voice boundaries have audible, configurable breathing room", () => {
  assert.equal(requiredVoiceGapMs({ previous: "diegetic", next: "narrator" }), 750);
  assert.equal(requiredVoiceGapMs({ previous: "narrator", next: "narrator" }), 500);
  assert.equal(requiredVoiceGapMs({ previous: "diegetic", next: "diegetic" }), 0);
  assert.equal(PERCEIVED_TIMING_POLICY.maxUnapprovedDeadAirMs, 10_000);
  assert.equal(requiredVoiceGapMs(
    { previous: "narrator", next: "narrator" },
    { narratorToNarratorMs: 650, diegeticToNarratorMs: 900 },
  ), 650);
});

test("only an explicit interruption removes required breathing room", () => {
  assert.equal(requiredVoiceGapMs({
    previous: "narrator",
    next: "narrator",
    interrupted: true,
  }), 0);
});
