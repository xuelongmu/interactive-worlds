import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_FIRST_SHOT_SHA256,
  buildAudioStages,
  MINIMUM_AFTERMATH_MS,
  reviewCheckpoints,
  TRUSTED_VOLLEY_SHA256,
} from "./lexington-volley-lib.mjs";

test("sequences the isolated report before the combined volley", () => {
  const stages = buildAudioStages({
    cutsceneDurationSeconds: 25,
    isolatedShotDurationSeconds: 4,
    volleyDurationSeconds: 8,
    leadInMs: 220,
  });

  assert.deepEqual(stages.isolatedShot, {
    cue: "LEX-SFX-001",
    startMs: 220,
    endMs: 4_220,
    durationMs: 4_000,
  });
  assert.deepEqual(stages.volley, {
    cue: "LEX-SFX-002",
    startMs: 4_220,
    endMs: 12_220,
    durationMs: 8_000,
  });
  assert.equal(stages.volley.startMs, stages.isolatedShot.endMs);
  assert.deepEqual(stages.aftermath, {
    kind: "authored-silence",
    startMs: 12_220,
    endMs: 25_000,
    durationMs: 12_780,
  });
  assert.ok(stages.aftermath.durationMs >= MINIMUM_AFTERMATH_MS);
});

test("rejects an edit that cannot hold four seconds of aftermath", () => {
  assert.throws(
    () => buildAudioStages({
      cutsceneDurationSeconds: 16,
      isolatedShotDurationSeconds: 4,
      volleyDurationSeconds: 8,
      leadInMs: 220,
    }),
    /at least 4\.000s is required/
  );
});

test("contact-sheet checkpoints cover the match, both SFX stages, and aftermath", () => {
  const stages = buildAudioStages({
    cutsceneDurationSeconds: 25,
    isolatedShotDurationSeconds: 4,
    volleyDurationSeconds: 8,
    leadInMs: 220,
  });
  const checkpoints = reviewCheckpoints(stages, 25);

  assert.deepEqual(checkpoints.map(({ id }) => id), [
    "match-cut",
    "isolated-shot-report",
    "volley-begins",
    "aftermath-begins",
    "aftermath-hold",
  ]);
  assert.ok(checkpoints[1].atMs < stages.isolatedShot.endMs);
  assert.ok(checkpoints[2].atMs >= stages.volley.startMs);
  assert.ok(checkpoints[3].atMs >= stages.aftermath.startMs);
});

test("pins the immutable issue #43 volley artifact", () => {
  assert.equal(
    TRUSTED_VOLLEY_SHA256,
    "b5b74d6f3dcdfe3d02648ff9f86cc788105203acc2c40462e20e28f48bc49eae"
  );
});

test("pins the frozen issue #43 first-shot candidate", () => {
  assert.equal(
    APPROVED_FIRST_SHOT_SHA256,
    "bd577ba5e6a32c8e65105bd4ea318921de7a823f573c225a36a75bc28a9d5b21"
  );
});
