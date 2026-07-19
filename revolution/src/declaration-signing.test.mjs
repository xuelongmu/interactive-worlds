import assert from "node:assert/strict";
import test from "node:test";
import declaration from "./scenes/declaration.json" with { type: "json" };
import { DeclarationSigningFlow } from "./renderers/declaration-flow.ts";
import { loadState, saveSignature } from "./engine/state.ts";

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

test("Declaration cue manifest preserves the silent dry and +8s narration beats", () => {
  const cues = declaration.cues;
  assert.deepEqual(cues.map((cue) => cue.id), ["DEC-010", "DEC-011", "DEC-030", "DEC-060", "DEC-061", "DEC-070"]);
  assert.deepEqual(cues[3].trigger, { type: "action", name: "sign-complete" });
  assert.equal(cues[3].subtitle, " ");
  assert.deepEqual(cues[4].trigger, { type: "action", name: "quill-down" });
});

test("signing flow emits four actions, captures normalized vectors, and persists", () => {
  let now = 1_000;
  const actions = [];
  const saves = [];
  const flow = new DeclarationSigningFlow({
    persist: (strokes) => saves.push(strokes),
    emit: (action) => actions.push(action),
    now: () => now,
  });

  assert.equal(flow.approachTable(), true);
  assert.equal(flow.pickupQuill(), true);
  assert.equal(flow.beginStroke(-1, 0.2), true);
  flow.appendStroke(0.5, 1.4);
  assert.equal(flow.endStroke(), true);
  assert.deepEqual(flow.strokes[0].points, [[0, 0.2], [0.5, 1]]);
  assert.equal(saves.length, 1);
  assert.equal(flow.completeSignature(), true);
  assert.equal(flow.canSetDown(), false);
  now += 8_000;
  assert.equal(flow.setDown(), true);
  assert.deepEqual(actions, ["approach-table", "quill-pickup", "sign-complete", "quill-down"]);
  assert.equal(saves.length, 2);
});

test("setting down without signing is an unremarked refusal path", () => {
  const actions = [];
  const flow = new DeclarationSigningFlow({ persist: () => {}, emit: (action) => actions.push(action) });
  flow.approachTable();
  flow.pickupQuill();
  assert.equal(flow.setDown(), true);
  assert.deepEqual(actions, ["approach-table", "quill-pickup", "quill-down"]);
});

test("signature vectors survive a state reload", () => {
  installStorage();
  const saved = [{ points: [[0.12, 0.34], [0.65, 0.78]] }];
  saveSignature(saved);
  assert.deepEqual(loadState().signature, saved);
});
