import assert from "node:assert/strict";
import test from "node:test";
import {
  BeatNavigationKeyArbiter,
  ContextualChoiceKeyArbiter,
  controlAnnouncement,
  defaultControlHandoff,
  instructionHudMarkup,
  InstructionHudModel,
  publishControlHandoff,
  publishPauseState,
} from "./control-hud.ts";
import {
  createBranchState,
  getBranchPresentation,
  selectDelawareDuty,
} from "./branch-state.ts";

function choiceSnapshot(sceneId, transitionKey, presentation, overrides = {}) {
  return {
    sceneId,
    transitionKey,
    momentId: presentation.momentId,
    objective: presentation.objective,
    actions: presentation.actions,
    ready: true,
    selectedChoiceId: presentation.selectedChoiceId,
    latchedChoiceId: presentation.latchedChoiceId,
    acknowledgement: presentation.acknowledgement,
    commandError: null,
    ...overrides,
  };
}

function keyEvent({ code, key = "", target = null, ...overrides }) {
  let prevented = false;
  return {
    code,
    key,
    target,
    repeat: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() { prevented = true; },
    wasPrevented() { return prevented; },
    ...overrides,
  };
}

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

test("contextual choices require ready, usable simultaneous E/F actions", () => {
  const model = new InstructionHudModel();
  const base = defaultControlHandoff("tea-party", "worldmodel");
  const unusable = getBranchPresentation(
    createBranchState(),
    "tea-party-deck-duty-choice",
  );
  const usable = getBranchPresentation(
    createBranchState(),
    "tea-party-deck-duty-choice",
    { usable: true },
  );
  model.transition(base);
  model.updateChoices(choiceSnapshot("tea-party", 0, unusable));
  assert.equal(model.snapshot().reason, "early");
  assert.ok(model.snapshot().bindings.every((binding) => !["E", "F"].includes(binding.binding)));

  model.updateChoices(choiceSnapshot("tea-party", 0, usable, { ready: false }));
  assert.equal(model.snapshot().reason, "early");
  model.updateChoices(choiceSnapshot("tea-party", 0, usable));
  assert.equal(model.snapshot().objective, "Choose your first deck duty.");
  assert.deepEqual(
    model.snapshot().bindings.map(({ binding, label }) => ({ binding, label })),
    [
      { binding: "E", label: "Break a chest" },
      { binding: "F", label: "Sweep the deck" },
    ],
  );
  assert.equal(model.snapshot().reason, "action");
  assert.equal(
    controlAnnouncement(model.snapshot()),
    "Objective. Choose your first deck duty. Actions available. " +
      "E — Break a chest. F — Sweep the deck.",
  );
});

test("renderer transitions reset demonstrated guidance and pause suppresses the layer", () => {
  const model = new InstructionHudModel();
  model.transition(defaultControlHandoff("tea-party", "splat"));
  model.demonstrate("movement");
  model.demonstrate("look");
  assert.equal(model.snapshot().visible, false);

  model.transition({
    ...defaultControlHandoff("tea-party", "worldmodel"),
    transitionKey: 1,
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

test("branch presentation v2 supplies one objective and exact simultaneous actions", () => {
  const presentation = getBranchPresentation(
    createBranchState(),
    "delaware-duty-choice",
    { usable: true },
  );
  assert.equal(presentation.objective, "Choose your duty for the crossing.");
  assert.deepEqual(
    presentation.actions.map(({ binding, label, usable }) => ({ binding, label, usable })),
    [
      { binding: "E", label: "Pole from the bow", usable: true },
      { binding: "F", label: "Clear ice from the hull", usable: true },
    ],
  );
  assert.equal(presentation.acknowledgement, null);

  const neutral = getBranchPresentation(createBranchState(), "out-of-range");
  assert.equal(neutral.objective, null);
  assert.equal(neutral.actions, null);
});

test("Trenton acknowledgement, objective, and E/F choices share the instruction layer", () => {
  const selected = selectDelawareDuty(createBranchState(), "clear-ice");
  const presentation = getBranchPresentation(
    selected,
    "trenton-perspective-choice",
    { usable: true },
  );
  const model = new InstructionHudModel();
  model.transition(defaultControlHandoff("trenton", "worldmodel"));
  model.updateChoices(choiceSnapshot("trenton", 0, presentation));
  const snapshot = model.snapshot();

  assert.equal(snapshot.reason, "action");
  assert.equal(snapshot.objective, "Choose where to advance.");
  assert.equal(snapshot.acknowledgement, "At the crossing, you chose to clear ice from the hull.");
  assert.deepEqual(
    snapshot.bindings.map(({ binding, label }) => ({ binding, label })),
    [
      { binding: "E", label: "Stay with the column" },
      { binding: "F", label: "Move toward the guns" },
    ],
  );
  assert.equal(
    controlAnnouncement(snapshot),
    "Confirmation. At the crossing, you chose to clear ice from the hull. " +
      "Objective. Choose where to advance. Actions available. " +
      "E — Stay with the column. F — Move toward the guns."
  );
});

test("Director callback bridge preserves exact control and pause detail", () => {
  const detail = {
    sceneId: "trenton",
    renderer: "worldmodel",
    controlsEnabled: true,
    movement: { binding: "WASD", label: "Move" },
    look: { binding: "Mouse", label: "Look" },
    transitionKey: 9,
  };
  const events = [];
  const target = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };

  assert.equal(publishControlHandoff(detail, target), true);
  assert.equal(events[0].type, "revolution:control-handoff");
  assert.equal(events[0].detail, detail);

  const pause = { paused: true, canResumePointerInput: true };
  assert.equal(publishPauseState(pause, target), true);
  assert.equal(events[1].type, "revolution:pause-state");
  assert.equal(events[1].detail, pause);
});

test("backend command errors stay visible and retryable while confirmed latches hide actions", () => {
  const model = new InstructionHudModel();
  const presentation = getBranchPresentation(
    createBranchState(),
    "delaware-duty-choice",
    { usable: true },
  );
  const [pole] = presentation.actions;
  model.transition(defaultControlHandoff("delaware", "worldmodel"));
  model.updateChoices(choiceSnapshot("delaware", 0, presentation, {
    commandError: {
      momentId: pole.momentId,
      choiceId: pole.choiceId,
      requestId: pole.requestId,
      message: "The action was not confirmed. Try again.",
      visible: true,
      retryable: true,
    },
  }));
  assert.equal(model.snapshot().reason, "error");
  assert.equal(model.snapshot().error, "The action was not confirmed. Try again.");
  assert.deepEqual(model.snapshot().bindings.map(({ binding }) => binding), ["E", "F"]);

  model.updateChoices(choiceSnapshot("delaware", 0, presentation, {
    selectedChoiceId: pole.choiceId,
    latchedChoiceId: pole.choiceId,
    acknowledgement: "Crossing duty confirmed: pole from the bow.",
  }));
  const confirmed = model.snapshot();
  assert.equal(confirmed.reason, "guidance");
  assert.equal(confirmed.objective, "");
  assert.equal(confirmed.acknowledgement, "Crossing duty confirmed: pole from the bow.");
  assert.ok(confirmed.bindings.every(({ binding }) => !["E", "F"].includes(binding)));
});

test("contextual choice input requests one edge and only confirmed latch completes it", () => {
  const presentation = getBranchPresentation(
    createBranchState(),
    "tea-party-deck-duty-choice",
    { usable: true },
  );
  const requests = [];
  const arbiter = new ContextualChoiceKeyArbiter((request) => {
    requests.push(request);
    return { status: "requested", requestId: request.requestId };
  });
  const snapshot = choiceSnapshot("tea-party", 4, presentation);
  arbiter.update(snapshot);

  const accepted = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(accepted), true);
  assert.equal(accepted.wasPrevented(), true);
  assert.deepEqual(requests, [{
    momentId: presentation.actions[0].momentId,
    choiceId: presentation.actions[0].choiceId,
    requestId: presentation.actions[0].requestId,
  }]);

  const whilePending = keyEvent({ code: "KeyF" });
  assert.equal(arbiter.handleKeyDown(whilePending), false);
  assert.equal(whilePending.wasPrevented(), false);
  arbiter.handleKeyUp("KeyE");
  arbiter.handleKeyUp("KeyF");

  arbiter.update({
    ...snapshot,
    commandError: {
      momentId: presentation.actions[0].momentId,
      choiceId: presentation.actions[0].choiceId,
      requestId: presentation.actions[0].requestId,
      message: "Try again.",
      visible: true,
      retryable: true,
    },
  });
  const retry = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(retry), true);
  assert.equal(requests.length, 2);
  arbiter.handleKeyUp("KeyE");

  arbiter.update({ ...snapshot, latchedChoiceId: presentation.actions[0].choiceId });
  const afterLatch = keyEvent({ code: "KeyF" });
  assert.equal(arbiter.handleKeyDown(afterLatch), false);
  assert.equal(afterLatch.wasPrevented(), false);
  assert.equal(requests.length, 2);
});

test("contextual choice guards typing, modifiers, repeats, readiness, and lifecycle resets", () => {
  const presentation = getBranchPresentation(
    createBranchState(),
    "saratoga-analysis-lens-choice",
    { usable: true },
  );
  const requests = [];
  const arbiter = new ContextualChoiceKeyArbiter((request) => {
    requests.push(request);
    return { status: "requested", requestId: request.requestId };
  });
  const ready = choiceSnapshot("saratoga", 8, presentation);

  arbiter.update({ ...ready, ready: false });
  const notReady = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(notReady), false);
  assert.equal(notReady.wasPrevented(), false);
  arbiter.handleKeyUp("KeyE");
  arbiter.update(ready);

  for (const guarded of [
    keyEvent({ code: "KeyE", repeat: true }),
    keyEvent({ code: "KeyE", ctrlKey: true }),
    keyEvent({ code: "KeyE", altKey: true }),
    keyEvent({ code: "KeyE", metaKey: true }),
    keyEvent({ code: "KeyE", target: { tagName: "INPUT" } }),
  ]) {
    assert.equal(arbiter.handleKeyDown(guarded), false);
    assert.equal(guarded.wasPrevented(), false);
  }

  const first = keyEvent({ code: "KeyF" });
  assert.equal(arbiter.handleKeyDown(first), true);
  assert.equal(requests.length, 1);
  arbiter.resetInput("blur");
  const afterBlur = keyEvent({ code: "KeyF" });
  assert.equal(arbiter.handleKeyDown(afterBlur), true);
  assert.equal(requests.length, 2);
  arbiter.resetInput("chapter-change");
  const afterChapterChange = keyEvent({ code: "KeyF" });
  assert.equal(arbiter.handleKeyDown(afterChapterChange), true);
  assert.equal(requests.length, 3);
  arbiter.resetInput("dispose");
  arbiter.update({ ...ready, transitionKey: 9 });
  const afterSceneReset = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(afterSceneReset), true);
  assert.equal(requests.length, 4);
});

test("a rejected request result clears pending without confirming a choice", async () => {
  const presentation = getBranchPresentation(
    createBranchState(),
    "delaware-duty-choice",
    { usable: true },
  );
  const results = ["unavailable", "requested"];
  const requests = [];
  const arbiter = new ContextualChoiceKeyArbiter(async (request) => {
    requests.push(request);
    const status = results.shift();
    return { status, requestId: request.requestId };
  });
  arbiter.update(choiceSnapshot("delaware", 2, presentation));

  const unavailable = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(unavailable), true);
  assert.equal(unavailable.wasPrevented(), true);
  await Promise.resolve();
  arbiter.handleKeyUp("KeyE");

  const retry = keyEvent({ code: "KeyE" });
  assert.equal(arbiter.handleKeyDown(retry), true);
  assert.equal(requests.length, 2);
  assert.equal(retry.wasPrevented(), true);
});

test("Period and Comma navigation accepts code/key fallbacks and requires release edges", () => {
  const requests = [];
  const arbiter = new BeatNavigationKeyArbiter((request) => requests.push(request));
  arbiter.update({
    sceneId: "lexington",
    transitionKey: 3,
    active: true,
    nextAvailable: true,
    previousAvailable: true,
    feedback: null,
  });

  const next = keyEvent({ code: "Period", key: "" });
  assert.equal(arbiter.handleKeyDown(next), true);
  assert.equal(next.wasPrevented(), true);
  const held = keyEvent({ code: "Period", key: "." });
  assert.equal(arbiter.handleKeyDown(held), false);
  assert.equal(held.wasPrevented(), false);
  arbiter.handleKeyUp({ code: "Period", key: "." });

  const previousFallback = keyEvent({ code: "", key: "," });
  assert.equal(arbiter.handleKeyDown(previousFallback), true);
  assert.equal(previousFallback.wasPrevented(), true);
  assert.deepEqual(requests, [
    { type: "nextBeat", sceneId: "lexington", transitionKey: 3 },
    { type: "previousBeat", sceneId: "lexington", transitionKey: 3 },
  ]);
});

test("beat navigation guards repeats, typing, modifiers, menu state, availability, and disposal", () => {
  const requests = [];
  const arbiter = new BeatNavigationKeyArbiter((request) => requests.push(request));
  const active = {
    sceneId: "delaware",
    transitionKey: 5,
    active: true,
    nextAvailable: true,
    previousAvailable: true,
    feedback: null,
  };
  arbiter.update(active);
  for (const guarded of [
    keyEvent({ code: "Period", key: ".", repeat: true }),
    keyEvent({ code: "Period", key: ".", ctrlKey: true }),
    keyEvent({ code: "Period", key: ".", altKey: true }),
    keyEvent({ code: "Period", key: ".", metaKey: true }),
    keyEvent({ code: "Period", key: ".", shiftKey: true }),
    keyEvent({ code: "Period", key: ".", target: { tagName: "TEXTAREA" } }),
  ]) {
    assert.equal(arbiter.handleKeyDown(guarded), false);
    assert.equal(guarded.wasPrevented(), false);
  }

  arbiter.update({ ...active, active: false });
  const menuOwned = keyEvent({ code: "Period", key: "." });
  assert.equal(arbiter.handleKeyDown(menuOwned), false);
  assert.equal(menuOwned.wasPrevented(), false);
  arbiter.handleKeyUp(menuOwned);
  arbiter.update({ ...active, nextAvailable: false });
  const unavailable = keyEvent({ code: "Period", key: "." });
  assert.equal(arbiter.handleKeyDown(unavailable), false);
  assert.equal(unavailable.wasPrevented(), false);

  arbiter.resetInput("dispose");
  arbiter.update(active);
  const afterDispose = keyEvent({ code: "Period", key: "." });
  assert.equal(arbiter.handleKeyDown(afterDispose), true);
  assert.equal(requests.length, 1);
});

test("beat navigation help and feedback remain in the instruction layer", () => {
  const model = new InstructionHudModel();
  model.transition(defaultControlHandoff("yorktown", "gameplay"));
  model.updateBeatNavigation({
    sceneId: "yorktown",
    transitionKey: 0,
    active: true,
    nextAvailable: true,
    previousAvailable: false,
    feedback: null,
  });
  assert.deepEqual(model.snapshot().bindings, [
    { binding: ".", label: "Next beat", modality: "keyboard-mouse", available: true },
    { binding: ",", label: "Previous beat", modality: "keyboard-mouse", available: false },
  ]);

  model.updateBeatNavigationResult({
    outcome: "clamped",
    request: { type: "previousBeat", sceneId: "yorktown", transitionKey: 0 },
    message: "Already at the first beat.",
  });
  assert.equal(model.snapshot().reason, "error");
  assert.equal(model.snapshot().error, "Already at the first beat.");
  model.updateBeatNavigationResult({
    outcome: "error",
    request: { type: "nextBeat", sceneId: "yorktown", transitionKey: 99 },
    message: "Stale result.",
  });
  assert.equal(model.snapshot().error, "Already at the first beat.");
  model.setPaused(true);
  assert.equal(model.snapshot().reason, "hidden");
});
