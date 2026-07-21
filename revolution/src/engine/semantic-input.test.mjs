import assert from "node:assert/strict";
import test from "node:test";
import { bindSemanticTouchControls, SemanticInputController } from "./semantic-input.ts";

class Surface extends EventTarget {
  captured = new Set();
  setPointerCapture(id) { this.captured.add(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function pointer(type, id, x, y) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: id }, pointerType: { value: "touch" }, button: { value: 0 },
    clientX: { value: x }, clientY: { value: y },
  });
  return event;
}

function harness(options = {}) {
  const events = [];
  const controller = new SemanticInputController({
    onMovement: (intent) => events.push(["movement", { ...intent }]),
    onLook: (intent) => events.push(["look", { ...intent }]),
    onAction: (intent) => events.push(["action", { ...intent }]),
    onReset: (reason) => events.push(["reset", reason]),
    onModalityChange: (modality) => events.push(["modality", modality]),
  }, options);
  return { controller, events };
}

test("pointer IDs own independent movement and look surfaces with diagonal axes and bounded look", () => {
  const { controller, events } = harness();
  const movement = new Surface();
  const look = new Surface();
  const unbind = bindSemanticTouchControls({
    controller, movementSurface: movement, lookSurface: look,
    movementRadius: 50, lookSensitivity: 0.01, maxLookDelta: 0.1,
  });

  movement.dispatchEvent(pointer("pointerdown", 1, 50, 50));
  look.dispatchEvent(pointer("pointerdown", 2, 200, 50));
  // A second finger cannot steal the occupied movement surface.
  movement.dispatchEvent(pointer("pointerdown", 3, 0, 0));
  movement.dispatchEvent(pointer("pointermove", 1, 75, 25));
  look.dispatchEvent(pointer("pointermove", 2, 200.5, 49.5));
  assert.equal(events.some(([kind]) => kind === "look"), false);
  look.dispatchEvent(pointer("pointermove", 2, 240, 10));

  const diagonal = events.findLast(([kind, value]) => kind === "movement" && value.forward > 0);
  assert.deepEqual(diagonal, ["movement", { forward: 0.5, strafe: 0.5 }]);
  assert.deepEqual(events.findLast(([kind]) => kind === "look"), [
    "look", { yaw: 0.1, pitch: 0.1, mode: "delta" },
  ]);
  assert.deepEqual([...movement.captured], [1]);
  assert.deepEqual([...look.captured], [2]);

  movement.dispatchEvent(pointer("pointerup", 1, 75, 25));
  look.dispatchEvent(pointer("pointercancel", 2, 240, 10));
  assert.deepEqual(events.filter(([kind]) => kind === "movement").at(-1), [
    "movement", { forward: 0, strafe: 0 },
  ]);
  assert.deepEqual(events.filter(([kind]) => kind === "look").at(-1), [
    "look", { yaw: 0, pitch: 0, mode: "idle" },
  ]);
  unbind();
});

test("cancel, lost capture, blur, and visibility loss always release retained touch state", () => {
  for (const boundary of ["pointercancel", "lostpointercapture"]) {
    const { controller, events } = harness();
    const movement = new Surface();
    const unbind = bindSemanticTouchControls({ controller, movementSurface: movement });
    movement.dispatchEvent(pointer("pointerdown", 7, 0, 0));
    movement.dispatchEvent(pointer("pointermove", 7, 40, -40));
    movement.dispatchEvent(pointer(boundary, 7, 40, -40));
    assert.deepEqual(events.filter(([kind]) => kind === "movement").at(-1), [
      "movement", { forward: 0, strafe: 0 },
    ]);
    unbind();
  }

  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  const { controller, events } = harness();
  const movement = new Surface();
  const unbind = bindSemanticTouchControls({ controller, movementSurface: movement, windowTarget, documentTarget });
  movement.dispatchEvent(pointer("pointerdown", 8, 0, 0));
  movement.dispatchEvent(pointer("pointermove", 8, 0, -40));
  windowTarget.dispatchEvent(new Event("blur"));
  assert.deepEqual(events.at(-1), ["reset", "blur"]);
  movement.dispatchEvent(pointer("pointerdown", 9, 0, 0));
  movement.dispatchEvent(pointer("pointermove", 9, 0, -40));
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(events.at(-1), ["reset", "visibility"]);
  unbind();
});

test("context actions gate on readiness and preserve press/release semantics", () => {
  const { controller, events } = harness();
  const unavailable = new Surface();
  const ready = new Surface();
  const unbind = bindSemanticTouchControls({
    controller,
    actions: [
      { surface: unavailable, actionId: "choice-a", isReady: () => false },
      { surface: ready, actionId: "choice-b", isReady: () => true },
    ],
  });
  unavailable.dispatchEvent(pointer("pointerdown", 1, 0, 0));
  unavailable.dispatchEvent(pointer("pointerup", 1, 0, 0));
  ready.dispatchEvent(pointer("pointerdown", 2, 0, 0));
  ready.dispatchEvent(pointer("pointerup", 2, 0, 0));
  assert.deepEqual(events.filter(([kind]) => kind === "action"), [
    ["action", { id: "choice-b", phase: "press" }],
    ["action", { id: "choice-b", phase: "release" }],
  ]);
  unbind();
});

test("modality switches clear touch state once before desktop input and navigation suppression keeps actions usable", () => {
  const { controller, events } = harness();
  controller.setMovement("touch:1", { forward: 1, strafe: 0 }, "touch");
  controller.setMovement("keyboard", { forward: 1, strafe: 0 }, "keyboard-mouse");
  assert.equal(events.filter(([kind, reason]) => kind === "reset" && reason === "modality-switch").length, 2);
  assert.deepEqual(events.filter(([kind]) => kind === "movement"), [
    ["movement", { forward: 1, strafe: 0 }],
    ["movement", { forward: 0, strafe: 0 }],
    ["movement", { forward: 1, strafe: 0 }],
  ]);

  controller.setNavigationEnabled(false);
  controller.setMovement("keyboard", { forward: -1, strafe: 1 }, "keyboard-mouse");
  controller.applyLookDelta("mouse", 1, 1, "keyboard-mouse");
  assert.equal(controller.pressAction("keyboard:E", "E", "keyboard-mouse", true), true);
  controller.releaseAction("keyboard:E", "keyboard-mouse");
  assert.deepEqual(events.filter(([kind]) => kind === "action").slice(-2), [
    ["action", { id: "E", phase: "press" }],
    ["action", { id: "E", phase: "release" }],
  ]);
});

test("pause, lock, handoff, fallback, rollover, disconnect, and dispose boundaries clear held input", () => {
  for (const reason of [
    "pause", "controls-locked", "renderer-handoff", "fallback", "generation-rollover", "disconnect",
  ]) {
    const { controller, events } = harness();
    controller.setMovement("touch:1", { forward: 1, strafe: 1 }, "touch");
    controller.applyLookDelta("touch:2", 0.05, -0.05, "touch");
    controller.pressAction("touch:3", "choice", "touch");
    controller.setEnabled(false, reason);
    assert.deepEqual(events.slice(-4), [
      ["movement", { forward: 0, strafe: 0 }],
      ["look", { yaw: 0, pitch: 0, mode: "idle" }],
      ["action", { id: "choice", phase: "release" }],
      ["reset", reason],
    ]);
  }
  const { controller, events } = harness();
  controller.setMovement("touch:1", { forward: 1, strafe: 0 }, "touch");
  controller.dispose();
  assert.deepEqual(events.at(-1), ["reset", "input-disposed"]);
  controller.setMovement("touch:1", { forward: -1, strafe: 0 }, "touch");
  assert.deepEqual(events.at(-1), ["reset", "input-disposed"]);
});

test("disabled and non-navigable ports refuse pointer ownership", () => {
  const { controller, events } = harness();
  const movement = new Surface();
  const action = new Surface();
  const unbind = bindSemanticTouchControls({
    controller,
    movementSurface: movement,
    actions: [{ surface: action, actionId: "available" }],
  });
  controller.setEnabled(false, "loading");
  movement.dispatchEvent(pointer("pointerdown", 1, 0, 0));
  assert.deepEqual([...movement.captured], []);
  controller.setEnabled(true);
  controller.setNavigationEnabled(false);
  movement.dispatchEvent(pointer("pointerdown", 2, 0, 0));
  assert.deepEqual([...movement.captured], []);
  action.dispatchEvent(pointer("pointerdown", 3, 0, 0));
  assert.deepEqual(events.filter(([kind]) => kind === "action").at(-1), [
    "action", { id: "available", phase: "press" },
  ]);
  unbind();
});

test("a lifecycle reset invalidates captured pointers until a fresh pointerdown", () => {
  const { controller, events } = harness();
  const movement = new Surface();
  const unbind = bindSemanticTouchControls({ controller, movementSurface: movement });
  movement.dispatchEvent(pointer("pointerdown", 4, 0, 0));
  movement.dispatchEvent(pointer("pointermove", 4, 0, -40));
  controller.setEnabled(false, "pause");
  controller.setEnabled(true, "resume");
  movement.dispatchEvent(pointer("pointermove", 4, 0, -50));
  assert.deepEqual(events.filter(([kind]) => kind === "movement").at(-1), [
    "movement", { forward: 0, strafe: 0 },
  ]);
  movement.dispatchEvent(pointer("pointerdown", 5, 0, 0));
  movement.dispatchEvent(pointer("pointermove", 5, 0, -40));
  assert.ok(events.filter(([kind]) => kind === "movement").at(-1)[1].forward > 0);
  unbind();
});
