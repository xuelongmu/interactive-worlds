import assert from "node:assert/strict";
import test from "node:test";
import { STALL_HINT_DELAY_MS, StallHintTimer } from "./stall.ts";

test("stall hint reveals after twenty seconds and activity immediately hides and rearms it", () => {
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
