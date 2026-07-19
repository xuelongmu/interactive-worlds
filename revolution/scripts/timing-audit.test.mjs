import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditSceneTiming,
  formatTimingAudit,
  readCbrMp3DurationSeconds,
} from "./timing-audit.mjs";

const revolutionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = () => auditSceneTiming({
  sceneDirectory: path.join(revolutionRoot, "src", "scenes"),
  publicDirectory: path.join(revolutionRoot, "public"),
});

test("all nine scenes, including read-only Declaration, have complete handoff coverage", () => {
  const audit = result();
  assert.equal(audit.sceneFiles.length, 9);
  assert.ok(audit.sceneFiles.some(({ file }) => file === "declaration.json"));
  const expectedCompletedTriggers = audit.sceneFiles.reduce((count, { manifest }) =>
    count + manifest.cues.filter((cue) =>
      ["action", "model-event", "zone-enter", "dwell"].includes(cue.trigger.type)).length, 0);
  const expectedThenHandoffs = audit.sceneFiles.reduce((count, { manifest }) =>
    count + manifest.cues.filter((cue) => cue.then).length, 0);
  assert.equal(audit.directEventHandoffs.length, expectedCompletedTriggers);
  assert.equal(audit.authoredThenHandoffs.length, expectedThenHandoffs);
  assert.deepEqual(audit.structuralFailures, []);
  assert.deepEqual(audit.unclassifiedClocks, []);
});

test("post-cue fallbacks stay within the ceiling and report their extrema", () => {
  const audit = result();
  const gaps = audit.postCueFallbacks.map(({ gapMs }) => gapMs);
  assert.equal(Math.min(...gaps), 500);
  assert.equal(Math.max(...gaps), 10_000);
  assert.deepEqual(audit.summary.violations, []);
  assert.equal(audit.ok, true);
});

test("all cast-to-narrator and authored narrator boundaries use the spacing policy", () => {
  const audit = result();
  const castBoundaries = audit.voiceBoundaries.filter(({ id }) => id.endsWith(":diegetic-to-narrator"));
  assert.deepEqual(castBoundaries.map(({ sceneId, gapMs }) => [sceneId, gapMs]), [
    ["delaware", 750],
    ["teaparty", 750],
    ["trenton", 750],
  ]);
  assert.ok(audit.voiceBoundaries.some(({ id, gapMs }) =>
    id === "delaware:DEL-010:DEL-011:narrator-boundary" && gapMs === 500));
});

test("Tea, Saratoga, Yorktown, and Lexington carry the requested timing fields", () => {
  const audit = result();
  const manifests = new Map(audit.sceneFiles.map(({ manifest }) => [manifest.id, manifest]));
  const cue = (scene, id) => manifests.get(scene).cues.find((item) => item.id === id);
  const event = (scene, name) => manifests.get(scene).modelEvents.find((item) => item.name === name);

  assert.equal(event("teaparty", "deck-clear").at, 66.5);
  assert.equal(cue("teaparty", "TEA-080").trigger.orAfterPrevious, 0.5);
  assert.equal(cue("saratoga", "SAR-070").trigger.orAfterPrevious, 10);
  assert.equal(cue("yorktown", "YOR-080").trigger.orAfterPrevious, 10);
  assert.equal(cue("lexington", "LEX-080").trigger.afterEventSeconds, 4);
});

test("absolute playable/model clocks are documented rather than shortened", () => {
  const audit = result();
  assert.equal(audit.activityClocks.length, 14);
  assert.ok(audit.activityClocks.some(({ id, gapMs, activity }) =>
    id === "teaparty:TEA-080:orTimer"
      && gapMs === 210_000
      && activity.kind === "active-reactor"));
  assert.ok(audit.activityClocks.some(({ id, activity }) =>
    id === "valley-forge:VAL-060:orTimer"
      && activity.kind === "player-exploration"));
});

test("shipped Trenton VO keeps its scheduled post-surrender gap below ten seconds", () => {
  const duration = readCbrMp3DurationSeconds(
    path.join(revolutionRoot, "public", "assets", "audio", "vo", "TRE-040.mp3"),
  );
  assert.ok(duration > 19 && duration < 20);
  const audit = result();
  const sample = audit.samples.find(({ id }) => id === "trenton:TRE-040:TRE-050:scheduled-post-voice");
  assert.ok(sample.gapMs > 5_000 && sample.gapMs < 6_000);
});

test("CLI report includes min/max gaps, exclusions, and the pass/fail result", () => {
  const report = formatTimingAudit(result());
  assert.match(report, /Post-cue fallbacks: \d+; min 0\.50s; max 10s/);
  assert.match(report, /Exploration\/active-Reactor clocks/);
  assert.match(report, /Active Reactor beat clocks/);
  assert.match(report, /PASS: no unapproved perceived dead-air path exceeds 10s/);
});
