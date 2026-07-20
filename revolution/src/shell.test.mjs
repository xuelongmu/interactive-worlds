import assert from "node:assert/strict";
import test from "node:test";
import {
  getResumeScene,
  chapterAccessibleName,
  getTitleAction,
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

test("every chapter is available regardless of story progress", () => {
  assert.equal(isChapterUnlocked(0, scenes, state()), true);
  assert.equal(isChapterUnlocked(1, scenes, state()), true);
  assert.equal(isChapterUnlocked(1, scenes, state({ completedScenes: ["tea"] })), true);
  assert.equal(isChapterUnlocked(2, scenes, state({ completedScenes: ["tea"] })), true);
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

test("replaying a completed chapter remains the resumable chapter", () => {
  assert.equal(getResumeScene(
    scenes,
    state({ completedScenes: ["tea", "lex"], currentSceneId: "tea" })
  )?.id, "tea");
});

test("chapter accessible name includes every visible date and state label", () => {
  assert.equal(chapterAccessibleName(
    2,
    { title: "Lexington Green", date: "April 19, 1775" },
    "Locked"
  ), "Chapter 2, Lexington Green, April 19, 1775, Locked");
});

test("an in-progress replay wins over Begin Again even when every chapter was completed", () => {
  assert.equal(getTitleAction(
    scenes,
    state({ completedScenes: ["tea", "lex", "declaration"], currentSceneId: "tea" })
  ), "Continue");
  assert.equal(getTitleAction(
    scenes,
    state({ completedScenes: ["tea", "lex", "declaration"] })
  ), "Begin Again");
});
