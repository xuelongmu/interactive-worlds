import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { BRANCH_ACTION_MAPPINGS } from "../branch-state.ts";

function scene(id) {
  return JSON.parse(fs.readFileSync(new URL(`../scenes/${id}.json`, import.meta.url), "utf8"));
}

test("non-Declaration manifests map all four exact E/F moments and later acknowledgements", () => {
  const choices = [
    ["teaparty", "tea-party-deck-duty-choice", "tea-party-deck-duty"],
    ["delaware", "delaware-duty-choice", "delaware-duty"],
    ["trenton", "trenton-perspective-choice", "trenton-perspective"],
    ["saratoga", "saratoga-analysis-lens-choice", "saratoga-analysis-lens"],
  ];
  for (const [sceneId, context, momentId] of choices) {
    const manifest = scene(sceneId);
    assert.equal(manifest.branching.context, context);
    assert.equal(manifest.branching.actions.length, 2);
    assert.deepEqual(
      manifest.branching.actions.map((action) => action.choiceId),
      BRANCH_ACTION_MAPPINGS.filter((mapping) => mapping.momentId === momentId)
        .map((mapping) => mapping.choiceId),
    );
    for (const action of manifest.branching.actions) {
      assert.ok(action.heldPrompt.length > 20);
      assert.ok(action.releasedPrompt.length > 20);
      assert.notEqual(action.heldPrompt, action.releasedPrompt);
    }
  }

  assert.equal(scene("lexington").branching.context, "lexington-deck-duty-acknowledgement");
  assert.equal(scene("trenton").branching.context, "trenton-perspective-choice");
  assert.equal(scene("saratoga").branching.context, "saratoga-analysis-lens-choice");
  assert.equal(scene("valley-forge").branching.context, "valley-forge-analysis-acknowledgement");
});

test("choice manifests retain their fixed convergent historical outcomes", () => {
  assert.ok(scene("teaparty").cues.some((cue) => cue.id === "TEA-080" && cue.then === "scene:lexington"));
  assert.ok(scene("delaware").modelEvents.some((event) => event.name === "landing"));
  assert.ok(scene("trenton").modelEvents.some((event) => event.name === "surrender"));
  assert.ok(scene("saratoga").cues.some((cue) => cue.id === "SAR-070" && /surrendered his entire army/.test(cue.subtitle)));
});

