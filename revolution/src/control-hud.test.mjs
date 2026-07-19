import assert from "node:assert/strict";
import test from "node:test";
import {
  controlAnnouncement,
  defaultControlHandoff,
  instructionHudMarkup,
  InstructionHudModel,
  withBranchPresentation,
} from "./control-hud.ts";
import {
  createBranchState,
  getBranchPresentation,
  selectDelawareDuty,
} from "./branch-state.ts";

test("Witness and Participant defaults accurately name WASD and mouse look", () => {
  for (const renderer of ["splat", "worldmodel"]) {
    const state = defaultControlHandoff("chapter", renderer);
    assert.deepEqual(state.movement, {
      binding: "W A S D",
      label: "Move",
      modality: "keyboard-mouse",
    });
    assert.deepEqual(state.look, {
      binding: "Mouse",
      label: "Look",
      modality: "keyboard-mouse",
    });
  }
});

test("instruction layer has separate control semantics from spoken content", () => {
  const markup = instructionHudMarkup();
  assert.match(markup, /aria-label="Controls and instructions"/);
  assert.match(markup, /data-accessibility-layer="instructions"/);
  assert.doesNotMatch(markup, /subtitle|narration/);
});

test("early controls hide only after movement and look are both demonstrated", () => {
  const model = new InstructionHudModel();
  model.transition(defaultControlHandoff("lexington", "splat"));
  assert.equal(model.snapshot().reason, "early");

  model.demonstrate("movement");
  assert.equal(model.snapshot().reason, "early");
  model.demonstrate("look");
  assert.equal(model.snapshot().reason, "hidden");

  model.stall();
  assert.equal(model.snapshot().reason, "stalled");
  assert.equal(model.snapshot().live, "polite");
  assert.equal(
    controlAnnouncement(model.snapshot()),
    "Controls reminder. W A S D — Move. Mouse — Look."
  );
});

test("only a usable contextual action is rendered and it uses the actual binding", () => {
  const model = new InstructionHudModel();
  const base = defaultControlHandoff("tea-party", "worldmodel");
  model.transition({
    ...base,
    action: { binding: "E", label: "Open chest", usable: false },
  });
  assert.equal(model.snapshot().reason, "early");
  assert.ok(model.snapshot().bindings.every((binding) => binding.binding !== "E"));

  model.transition({
    ...base,
    action: { binding: "E", label: "Open chest", usable: true },
  });
  assert.deepEqual(model.snapshot().bindings, [{ binding: "E", label: "Open chest", usable: true }]);
  assert.equal(model.snapshot().reason, "action");
  assert.equal(controlAnnouncement(model.snapshot()), "Action available. E — Open chest.");
});

test("renderer transitions reset demonstrated guidance and pause suppresses the layer", () => {
  const model = new InstructionHudModel();
  model.transition(defaultControlHandoff("tea-party", "splat"));
  model.demonstrate("movement");
  model.demonstrate("look");
  assert.equal(model.snapshot().visible, false);

  model.transition({
    ...defaultControlHandoff("tea-party", "worldmodel"),
    transitionKey: "tea-party:wake:worldmodel",
  });
  assert.equal(model.snapshot().reason, "early");
  model.setPaused(true);
  assert.equal(model.snapshot().reason, "hidden");
  model.setPaused(false);
  assert.equal(model.snapshot().reason, "early");
});

test("paused or disabled input is not credited as demonstrated", () => {
  const model = new InstructionHudModel();
  const controls = defaultControlHandoff("delaware", "worldmodel");
  model.transition(controls);
  model.setPaused(true);
  model.demonstrate("movement");
  model.demonstrate("look");
  model.setPaused(false);
  assert.equal(model.snapshot().reason, "early");

  model.transition({ ...controls, controlsEnabled: false });
  model.demonstrate("movement");
  model.demonstrate("look");
  model.transition({ ...controls, controlsEnabled: true });
  assert.equal(model.snapshot().reason, "early");
});

test("#52 branch presentation supplies exact actions without leaking into subtitles", () => {
  const base = defaultControlHandoff("delaware", "worldmodel");
  const choice = withBranchPresentation(
    base,
    getBranchPresentation(createBranchState(), "delaware-pole-choice")
  );
  assert.deepEqual(choice.action, {
    binding: "E",
    label: "Pole from the bow",
    usable: true,
  });
  assert.equal(choice.acknowledgement, null);

  const outOfRange = withBranchPresentation(
    { ...base, action: { binding: "E", label: "Interact", usable: true } },
    getBranchPresentation(createBranchState(), "out-of-range")
  );
  assert.equal(outOfRange.action, null);
});

test("Trenton acknowledgement and usable action share only the instruction layer", () => {
  const selected = selectDelawareDuty(createBranchState(), "clear-ice");
  const controls = withBranchPresentation(
    defaultControlHandoff("trenton", "worldmodel"),
    getBranchPresentation(selected, "trenton-duty-callback")
  );
  const model = new InstructionHudModel();
  model.transition(controls);
  const snapshot = model.snapshot();

  assert.equal(snapshot.reason, "action");
  assert.equal(snapshot.guidance, "At the crossing, you chose to clear ice from the hull.");
  assert.deepEqual(snapshot.bindings, [{
    binding: "E",
    label: "Clear the gun path",
    usable: true,
  }]);
  assert.equal(
    controlAnnouncement(snapshot),
    "Instruction. At the crossing, you chose to clear ice from the hull. " +
      "Action available. E — Clear the gun path."
  );
});
