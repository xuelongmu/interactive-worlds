import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorldModelInput } from "./worldmodel-input.ts";

test("held world-model input always resolves to idle while paused", () => {
  const held = new Set(["KeyW", "KeyA", "ArrowRight", "ArrowUp"]);
  assert.deepEqual(resolveWorldModelInput(held, true), {
    longitudinal: "idle",
    lateral: "idle",
    lookH: "idle",
    lookV: "idle",
  });

  held.delete("KeyA");
  assert.deepEqual(resolveWorldModelInput(held, true), {
    longitudinal: "idle",
    lateral: "idle",
    lookH: "idle",
    lookV: "idle",
  });
});

test("unpaused world-model input resolves held movement and look axes", () => {
  assert.deepEqual(resolveWorldModelInput(new Set(["KeyS", "KeyD", "ArrowLeft"]), false), {
    longitudinal: "back",
    lateral: "strafe_right",
    lookH: "left",
    lookV: "idle",
  });
});
