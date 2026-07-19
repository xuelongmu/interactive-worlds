import assert from "node:assert/strict";
import test from "node:test";
import {
  InteractionGate,
  configureLoadingSemantics,
  restartPausedScene,
  restoreFocus,
  setBackgroundInert,
  setPauseDialogView,
  trapFocus,
} from "./pause.ts";

const attributeTarget = () => ({
  inert: false,
  attributes: new Map(),
  setAttribute(name, value) { this.attributes.set(name, value); },
  removeAttribute(name) { this.attributes.delete(name); },
});

test("restart keeps the old scene paused until fade and teardown complete", async () => {
  const order = [];
  await restartPausedScene({
    resetPauseUi: () => order.push("reset-ui"),
    fadeOut: async () => { order.push("fade"); },
    teardown: async () => { order.push("teardown"); },
    releasePause: async () => { order.push("resume-empty-context"); },
    startScene: async () => { order.push("start-new-scene"); },
  });
  assert.deepEqual(order, [
    "reset-ui",
    "fade",
    "teardown",
    "resume-empty-context",
    "start-new-scene",
  ]);
});

test("gameplay action dispatch is blocked by pause and control locks", () => {
  const gate = new InteractionGate();
  let actions = 0;
  assert.equal(gate.dispatch(() => actions++), true);
  gate.setPaused(true);
  assert.equal(gate.dispatch(() => actions++), false);
  gate.setPaused(false);
  gate.setControlsLocked(true);
  assert.equal(gate.dispatch(() => actions++), false);
  assert.equal(actions, 1);
});

test("pause makes scene backgrounds inert and restores their accessibility state", () => {
  const targets = [attributeTarget(), attributeTarget()];
  setBackgroundInert(targets, true);
  assert.ok(targets.every((target) => target.inert));
  assert.ok(targets.every((target) => target.attributes.get("aria-hidden") === "true"));
  setBackgroundInert(targets, false);
  assert.ok(targets.every((target) => !target.inert));
  assert.ok(targets.every((target) => !target.attributes.has("aria-hidden")));
});

test("focus trap wraps at dialog edges and focus restore rejects detached targets", () => {
  const focused = [];
  const makeTarget = (name) => ({
    disabled: false,
    isConnected: true,
    closest: () => null,
    getAttribute: () => null,
    focus: () => focused.push(name),
  });
  const first = makeTarget("first");
  const last = makeTarget("last");
  const container = { querySelectorAll: () => [first, last] };

  assert.equal(trapFocus(container, last, false), true);
  assert.equal(focused.at(-1), "first");
  assert.equal(trapFocus(container, first, true), true);
  assert.equal(focused.at(-1), "last");
  assert.equal(restoreFocus({ ...first, isConnected: false }), false);
  assert.equal(restoreFocus(first), true);
});

test("loading status is live and dialog name follows the visible pause view", () => {
  const card = attributeTarget();
  const dialog = attributeTarget();
  configureLoadingSemantics(card);
  assert.equal(card.attributes.get("role"), "status");
  assert.equal(card.attributes.get("aria-live"), "polite");
  assert.equal(card.attributes.get("aria-atomic"), "true");

  setPauseDialogView(dialog, "settings");
  assert.equal(dialog.attributes.get("aria-labelledby"), "pause-settings-title");
  setPauseDialogView(dialog, "menu");
  assert.equal(dialog.attributes.get("aria-labelledby"), "pause-title");
});
