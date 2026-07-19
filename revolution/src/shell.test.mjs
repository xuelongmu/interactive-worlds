import assert from "node:assert/strict";
import test from "node:test";
import {
  getResumeScene,
  hasChapterDevOverride,
  isChapterUnlocked,
  splitChapterHeading,
} from "./shell.ts";

const scenes = [{ id: "tea" }, { id: "lex" }, { id: "declaration" }];
const state = (overrides = {}) => ({
  completedScenes: [],
  currentSceneId: null,
  signature: null,
  ...overrides,
});
test("chapter heading separates title and date", () => {
  assert.deepEqual(splitChapterHeading("Lexington Green — April 19, 1775"), {
    title: "Lexington Green",
    date: "April 19, 1775",
  });
});

test("progress unlocks only the first chapter, completed chapters, and their successor", () => {
  assert.equal(isChapterUnlocked(0, scenes, state()), true);
  assert.equal(isChapterUnlocked(1, scenes, state()), false);
  assert.equal(isChapterUnlocked(1, scenes, state({ completedScenes: ["tea"] })), true);
  assert.equal(isChapterUnlocked(2, scenes, state({ completedScenes: ["tea"] })), false);
  assert.equal(isChapterUnlocked(2, scenes, state({ currentSceneId: "declaration" })), true);
});

test("development override is explicit and unlocks every chapter", () => {
  assert.equal(hasChapterDevOverride("?unlock=chapters"), true);
  assert.equal(hasChapterDevOverride("?dev=1"), false);
  assert.equal(isChapterUnlocked(2, scenes, state(), true), true);
});

test("resume prefers an unfinished current chapter, then the first unfinished chapter", () => {
  assert.equal(getResumeScene(scenes, state({ currentSceneId: "lex" }))?.id, "lex");
  assert.equal(getResumeScene(scenes, state({ completedScenes: ["tea"] }))?.id, "lex");
  assert.equal(
    getResumeScene(scenes, state({ completedScenes: ["tea", "lex", "declaration"] }))?.id,
    "tea"
  );
});
