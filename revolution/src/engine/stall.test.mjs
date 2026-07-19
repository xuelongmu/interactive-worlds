import assert from "node:assert/strict";
import test from "node:test";
import { renderStallHint, STALL_HINT_DELAY_MS, StallHintTimer } from "./stall.ts";

test("stall hint reveals after ten seconds and activity immediately hides and rearms it", () => {
  const callbacks = [];
  const cleared = [];
  const visibility = [];
  const scheduler = {
    set(callback, delayMs) {
      callbacks.push({ callback, delayMs });
      return callbacks.length;
    },
    clear(handle) { cleared.push(handle); },
  };
  const hint = new StallHintTimer((visible) => visibility.push(visible), scheduler);

  hint.start();
  assert.equal(callbacks[0].delayMs, STALL_HINT_DELAY_MS);
  assert.deepEqual(visibility, [false]);

  callbacks[0].callback();
  assert.deepEqual(visibility, [false, true]);

  hint.activity();
  assert.deepEqual(visibility, [false, true, false]);
  assert.equal(callbacks[1].delayMs, STALL_HINT_DELAY_MS);

  hint.stop();
  assert.equal(cleared.at(-1), 2);
  assert.equal(visibility.at(-1), false);
});

test("stall hint becomes a live region only when revealed", () => {
  const attributes = new Map();
  const classes = new Set();
  const element = {
    textContent: "",
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name, value) { attributes.set(name, value); },
  };

  renderStallHint(element, "WASD to walk", false);
  assert.equal(attributes.get("aria-live"), "off");
  assert.equal(attributes.get("aria-hidden"), "true");
  assert.equal(element.textContent, "");

  renderStallHint(element, "WASD to walk", true);
  assert.equal(attributes.get("aria-live"), "polite");
  assert.equal(attributes.get("aria-hidden"), "false");
  assert.equal(element.textContent, "WASD to walk");
  assert.equal(classes.has("visible"), true);
});
