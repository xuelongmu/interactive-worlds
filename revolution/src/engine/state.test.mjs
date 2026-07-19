import assert from "node:assert/strict";
import test from "node:test";
import {
  loadState,
  markSceneComplete,
  resetStoryProgress,
  saveState,
} from "./state.ts";

const installStorage = () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
};

test("Begin Again clears completed, in-progress, and signature state", () => {
  installStorage();
  saveState({
    completedScenes: ["tea", "lex"],
    currentSceneId: "lex",
    signature: [{ points: [[0.2, 0.3]] }],
  });
  resetStoryProgress();
  assert.deepEqual(loadState(), {
    completedScenes: [],
    currentSceneId: null,
    signature: null,
  });
});

test("completing a replay clears its in-progress marker", () => {
  installStorage();
  saveState({ completedScenes: ["tea"], currentSceneId: "tea", signature: null });
  markSceneComplete("tea");
  assert.deepEqual(loadState(), {
    completedScenes: ["tea"],
    currentSceneId: null,
    signature: null,
  });
});
