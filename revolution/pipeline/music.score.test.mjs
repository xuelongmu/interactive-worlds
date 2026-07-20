import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SOURCE,
  SCORE_CUES,
  SCORE_OUTPUT_PLAN,
  SCORE_PLAN_SHA256,
  SELECTED_TAKE_ID,
  SELECTED_TAKE_SHA256,
  parseArgs,
  validateScoreManifestPlan,
} from "./music.score.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("locks the score to the director-approved Ink and String take", () => {
  assert.equal(
    SELECTED_TAKE_SHA256,
    "a9e526b4bc6745366ce25d767825caa5e5521edc3a2f98c628ee216776fdbc15"
  );
  assert.match(DEFAULT_SOURCE, /b-ink-and-string\.mp3$/);
});

test("defines one short chapter sting and four sparse earned swells", () => {
  assert.deepEqual(SCORE_CUES.map(({ id }) => id), [
    "chapter-sting",
    "swell-declaration",
    "swell-trenton",
    "swell-alliance",
    "swell-finale",
  ]);
  assert.ok(SCORE_CUES.every(({ start, duration, loudness }) =>
    start >= 0 && duration >= 2 && duration <= 7 && loudness <= -18
  ));
});

test("requires an explicit safe mode and rejects mistyped arguments", () => {
  assert.deepEqual(parseArgs(["--build"]), { mode: "build", source: DEFAULT_SOURCE });
  assert.deepEqual(parseArgs(["--audit", "--source", "approved.mp3"]), {
    mode: "audit",
    source: "approved.mp3",
  });
  assert.throws(() => parseArgs([]), /choose a mode/);
  assert.throws(() => parseArgs(["--build", "--audit"]), /exactly one mode/);
  assert.throws(() => parseArgs(["--buid"]), /unknown argument/);
  assert.throws(() => parseArgs(["--build", "--source"]), /requires a path/);
});

test("audit plan validation rejects stale output metadata", () => {
  const manifest = {
    selectedTake: SELECTED_TAKE_ID,
    selectedTakeSha256: SELECTED_TAKE_SHA256,
    scorePlanSha256: SCORE_PLAN_SHA256,
    outputs: SCORE_OUTPUT_PLAN.map((output) => ({ ...output, sha256: "test" })),
  };
  assert.doesNotThrow(() => validateScoreManifestPlan(manifest));

  const stale = structuredClone(manifest);
  stale.outputs[1].durationSeconds += 1;
  assert.throws(() => validateScoreManifestPlan(stale), /does not match plan/);
  assert.throws(
    () => validateScoreManifestPlan({ ...manifest, scorePlanSha256: "stale" }),
    /does not match the selected take/
  );
});

test("wires only the four approved post-narration swells", () => {
  const sceneDir = resolve(projectRoot, "src", "scenes");
  const placements = [];
  for (const file of readdirSync(sceneDir).filter((name) => name.endsWith(".json"))) {
    const scene = JSON.parse(readFileSync(resolve(sceneDir, file), "utf8"));
    for (const cue of scene.cues) {
      if (cue.musicAfter) placements.push([scene.id, cue.id, cue.musicAfter]);
    }
  }
  assert.deepEqual(placements, [
    ["declaration", "DEC-061", "/assets/audio/music/swell-declaration.mp3"],
    ["saratoga", "SAR-070", "/assets/audio/music/swell-alliance.mp3"],
    ["treaty-paris", "PAR-050", "/assets/audio/music/swell-finale.mp3"],
    ["trenton", "TRE-050", "/assets/audio/music/swell-trenton.mp3"],
  ]);
  assert.ok(placements.every(([scene]) => scene !== "lexington" && scene !== "yorktown"));
});
