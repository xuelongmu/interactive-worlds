import assert from "node:assert/strict";
import test from "node:test";

import { composeWorldModelPrompt, WORLD_MODEL_PROMPT_BUDGET } from "./worldmodel-prompt.ts";

const base = {
  base: "Same historically grounded river crossing.",
  lookH: "right",
  movement: { longitudinal: "forward", lateral: "strafe_left" },
  events: ["Hands pole from the bow."],
  lookV: "down",
};

test("prompt layers are deterministic and ordered base/camera/movement/events/vertical", () => {
  const prompt = composeWorldModelPrompt(base);
  assert.equal(prompt, composeWorldModelPrompt(base));
  const markers = [
    "Same historically grounded river crossing.",
    "Camera: first-person",
    "Camera motion: turn right",
    "Movement: preserve",
    "Movement intent: move forward",
    "Active event: Hands pole",
    "Vertical camera: look downward",
  ];
  let previous = -1;
  for (const marker of markers) {
    const index = prompt.indexOf(marker);
    assert.ok(index > previous, marker);
    previous = index;
  }
  assert.doesNotMatch(prompt, /sidestep/);
});

test("recomposition releases held clauses without accumulating corrections", () => {
  const held = composeWorldModelPrompt(base);
  const released = composeWorldModelPrompt({
    ...base,
    events: ["The pole is planted safely and the bow holds its line."],
  });
  const neutral = composeWorldModelPrompt({ ...base, events: [], lookH: "idle", lookV: "idle" });
  assert.match(held, /Hands pole/);
  assert.doesNotMatch(released, /Hands pole/);
  assert.match(released, /pole is planted safely/);
  assert.doesNotMatch(neutral, /pole/);
  assert.equal((neutral.match(/Camera:/g) ?? []).length, 1);
});

test("worst-case prompt remains below the explicit budget", () => {
  const prompt = composeWorldModelPrompt({
    ...base,
    base: "historical scene ".repeat(300),
    events: ["brief event ".repeat(200)],
  });
  assert.ok(prompt.length <= WORLD_MODEL_PROMPT_BUDGET);
  assert.ok(prompt.endsWith("…"));
});

