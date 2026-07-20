import assert from "node:assert/strict";
import test from "node:test";

import { adjacentBeat, beatAvailability, canonicalNarrativeBeats, executeBeatTransition } from "./beat-navigation.ts";

const scenes = [
  { id: "one", cues: [{ id: "ONE-010" }, { id: "ONE-020" }] },
  { id: "two", cues: [{ id: "TWO-010" }, { id: "TWO-020" }] },
];

test("canonical beat order moves exactly one beat within and across chapters", () => {
  const beats = canonicalNarrativeBeats(scenes);
  assert.deepEqual(beats.map((beat) => `${beat.sceneId}:${beat.cueId}`), [
    "one:ONE-010", "one:ONE-020", "two:TWO-010", "two:TWO-020",
  ]);
  assert.equal(adjacentBeat(beats, beats[0], "next"), beats[1]);
  assert.equal(adjacentBeat(beats, beats[1], "next"), beats[2]);
  assert.equal(adjacentBeat(beats, beats[2], "previous"), beats[1]);
});

test("global first/last clamp and availability are deterministic", () => {
  const beats = canonicalNarrativeBeats(scenes);
  assert.equal(adjacentBeat(beats, beats[0], "previous"), null);
  assert.equal(adjacentBeat(beats, beats.at(-1), "next"), null);
  assert.deepEqual(beatAvailability(beats, beats[0]), { previous: false, next: true });
  assert.deepEqual(beatAvailability(beats, beats.at(-1)), { previous: true, next: false });
});

test("transition cleanup completes before exact target entry", async () => {
  const beats = canonicalNarrativeBeats(scenes);
  const order = [];
  await executeBeatTransition(beats[2], {
    cleanup: async () => { order.push("cleanup:start"); await Promise.resolve(); order.push("cleanup:done"); },
    enter: async (target) => { order.push(`enter:${target.sceneId}:${target.cueId}`); },
  });
  assert.deepEqual(order, ["cleanup:start", "cleanup:done", "enter:two:TWO-010"]);
});
