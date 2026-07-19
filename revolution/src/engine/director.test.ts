import { describe, expect, it, vi } from "vitest";
import {
  activeRunnerCanResumePointerInput,
  canPrewarmWorldModelTarget,
  completeCutsceneHandoff,
  controlHandoffForScene,
  defaultGuidanceForCue,
  dispatchEngineEvent,
  runnerHasMovementInput,
  runnerCanResumePointerInput,
} from "./director";
import type { SceneManifest } from "./types";
import { prewarmDirectiveAt, WorldModelPrewarmController } from "./worldmodel-prewarm";
import type { WorldModelSession } from "../renderers/worldmodel";

function worldScene(id: string): SceneManifest {
  return {
    id,
    title: id,
    renderer: "worldmodel",
    assets: { referenceImage: `/${id}.jpg`, prompt: `${id} prompt` },
    zones: [],
    cues: [],
    audio: {},
  };
}

function fakeSession() {
  const session = {
    phase: "idle",
    prepareTransport: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    notePreparedAdoption: vi.fn(),
  };
  return session as unknown as WorldModelSession;
}

describe("Director held movement detection", () => {
  it("delegates through the runner wrapper used for splat scenes", () => {
    const hasMovementInput = vi.fn(() => true);

    expect(runnerHasMovementInput({ hasMovementInput })).toBe(true);
    expect(hasMovementInput).toHaveBeenCalledOnce();
  });

  it("does not report movement for runners without splat input", () => {
    expect(runnerHasMovementInput({})).toBe(false);
    expect(runnerHasMovementInput(null)).toBe(false);
  });

  it("queues aftermath before held movement can unlock the runner", () => {
    const order: string[] = [];

    completeCutsceneHandoff(
      () => order.push("LEX-080"),
      () => order.push("unlock/LEX-090")
    );

    expect(order).toEqual(["LEX-080", "unlock/LEX-090"]);
  });
});

describe("Director beat guidance", () => {
  it("does not describe renderer handoffs as player interactions", () => {
    for (const name of ["boarded", "control-granted", "cutscene-volley-complete", "signature-dwell"]) {
      expect(defaultGuidanceForCue({
        id: `SYSTEM-${name}`,
        trigger: { type: "action", name },
      })).toBeNull();
    }
  });

  it("keeps a default prompt for actual interaction actions", () => {
    expect(defaultGuidanceForCue({
      id: "PLAYER-ACTION",
      trigger: { type: "action", name: "quill-pickup" },
    })).toBe("Interact with the scene to continue");
  });
});

describe("Director pointer-input lifecycle", () => {
  it("derives resumability from the active runner capability", () => {
    expect(runnerCanResumePointerInput({ canResumePointerInput: () => true })).toBe(true);
    expect(runnerCanResumePointerInput({ canResumePointerInput: () => false })).toBe(false);
    expect(runnerCanResumePointerInput({})).toBe(false);
    expect(runnerCanResumePointerInput(null)).toBe(false);
  });

  it("uses the active renderer instead of the primary manifest renderer", () => {
    const pointerRunner = { canResumePointerInput: () => true };
    expect(activeRunnerCanResumePointerInput("worldmodel", pointerRunner)).toBe(true);
    expect(activeRunnerCanResumePointerInput("splat", pointerRunner)).toBe(true);
    expect(activeRunnerCanResumePointerInput("gameplay", pointerRunner)).toBe(false);
    expect(activeRunnerCanResumePointerInput("cutscene", pointerRunner)).toBe(false);
  });
});

describe("Director engine-event boundary", () => {
  it("delivers the typed event to story handling before observing it for SFX", () => {
    const order: string[] = [];
    const event = { type: "model-event", name: "storm" } as const;
    dispatchEngineEvent(
      event,
      (received) => order.push(`cue:${received.type}`),
      (received, sceneId) => order.push(`observer:${sceneId}:${received.type}`),
      "delaware"
    );
    expect(order).toEqual(["cue:model-event", "observer:delaware:model-event"]);
  });

  it("adds stable scene and transition identity to renderer control state", () => {
    expect(controlHandoffForScene("delaware", 4, {
      renderer: "worldmodel",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
      action: { binding: "E", label: "Interact", usable: true },
    })).toEqual({
      sceneId: "delaware",
      transitionKey: 4,
      renderer: "worldmodel",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
      action: { binding: "E", label: "Interact", usable: true },
    });
  });
});

describe("Director live-session prewarming", () => {
  it("keeps live-prewarm cues independent from static preloadAt markers", () => {
    const manifest = worldScene("current");
    manifest.next = { scene: "next", preloadAt: "STATIC-EARLY" };
    manifest.livePrewarm = [{
      at: "LIVE-LATE",
      target: "next",
      strategy: "conditioned",
    }];

    expect(prewarmDirectiveAt(manifest, "STATIC-EARLY")).toBeNull();
    expect(prewarmDirectiveAt(manifest, "LIVE-LATE")).toEqual(manifest.livePrewarm[0]);
  });

  it("allows transport-only wakes from a scene whose primary renderer is a splat", () => {
    const scene = worldScene("wake");
    scene.renderer = "splat";
    expect(canPrewarmWorldModelTarget(scene, "transport")).toBe(true);
    expect(canPrewarmWorldModelTarget(scene, "conditioned")).toBe(false);
  });

  it("fully conditions a baked-image session and adopts it by key", async () => {
    let now = 100;
    const session = fakeSession();
    const image = new Blob(["frame"]);
    const fetchReferenceImage = vi.fn().mockResolvedValue(image);
    const controller = new WorldModelPrewarmController({
      createSession: () => session,
      fetchReferenceImage,
      now: () => now,
    });
    const scene = worldScene("trenton");

    expect(await controller.prewarm({ scene, strategy: "conditioned" })).toBe(true);
    expect(fetchReferenceImage).toHaveBeenCalledWith("/trenton.jpg", undefined);
    expect(session.prepare).toHaveBeenCalledWith(image, "trenton prompt");
    expect(session.prepareTransport).not.toHaveBeenCalled();

    now = 350;
    expect(await controller.adopt("trenton", "conditioned")).toBe(session);
    expect(session.notePreparedAdoption).toHaveBeenCalledWith(250);
    expect(controller.pendingKey).toBeNull();
  });

  it("prepares only transport for a captured-frame wake", async () => {
    const session = fakeSession();
    const fetchReferenceImage = vi.fn();
    const controller = new WorldModelPrewarmController({
      createSession: () => session,
      fetchReferenceImage,
    });

    expect(await controller.prewarm({ scene: worldScene("tea-party"), strategy: "transport" })).toBe(true);
    expect(session.prepareTransport).toHaveBeenCalledOnce();
    expect(session.prepare).not.toHaveBeenCalled();
    expect(fetchReferenceImage).not.toHaveBeenCalled();
    expect(await controller.adopt("tea-party", "transport")).toBe(session);
  });

  it("owns one pending session and deterministically tears down replacements", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const sessions = [first, second];
    const controller = new WorldModelPrewarmController({
      createSession: () => sessions.shift()!,
    });

    await controller.prewarm({ scene: worldScene("first"), strategy: "transport" });
    await controller.prewarm({ scene: worldScene("second"), strategy: "transport" });
    expect(first.disconnect).toHaveBeenCalledWith({ reason: "replaced", dispose: true });
    expect(controller.pendingKey).toBe("second:transport");
    await controller.cancel("test-cleanup");
    expect(second.disconnect).toHaveBeenCalledWith({ reason: "test-cleanup", dispose: true });
  });

  it("serializes concurrent replacements without leaking the superseded session", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const sessions = [first, second];
    const controller = new WorldModelPrewarmController({
      createSession: () => sessions.shift()!,
    });

    const firstReady = controller.prewarm({ scene: worldScene("first"), strategy: "transport" });
    const secondReady = controller.prewarm({ scene: worldScene("second"), strategy: "transport" });

    expect(await firstReady).toBe(false);
    expect(await secondReady).toBe(true);
    expect(first.disconnect).toHaveBeenCalledWith({ reason: "replaced", dispose: true });
    expect(second.prepareTransport).toHaveBeenCalledOnce();
    expect(controller.pendingKey).toBe("second:transport");
  });

  it("preserves only a pending session that matches the next route", async () => {
    const session = fakeSession();
    const controller = new WorldModelPrewarmController({ createSession: () => session });
    await controller.prewarm({ scene: worldScene("expected"), strategy: "transport" });

    await controller.cancelUnlessTarget("expected", "route-changed");
    expect(session.disconnect).not.toHaveBeenCalled();
    await controller.cancelUnlessTarget("unexpected", "route-changed");
    expect(session.disconnect).toHaveBeenCalledWith({ reason: "route-changed", dispose: true });
  });

  it("tears down a same-scene session prepared with the wrong strategy", async () => {
    const session = fakeSession();
    const controller = new WorldModelPrewarmController({ createSession: () => session });
    await controller.prewarm({ scene: worldScene("same"), strategy: "transport" });

    await controller.cancelUnless("same", "conditioned", "strategy-changed");
    expect(session.disconnect).toHaveBeenCalledWith({ reason: "strategy-changed", dispose: true });
    expect(controller.pendingKey).toBeNull();
  });

  it("expires and disconnects an unadopted session", async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const controller = new WorldModelPrewarmController({ createSession: () => session });
    await controller.prewarm({ scene: worldScene("expiring"), strategy: "transport", ttlMs: 500 });

    await vi.advanceTimersByTimeAsync(501);
    expect(session.disconnect).toHaveBeenCalledWith({ reason: "ttl-expired", dispose: true });
    expect(controller.pendingKey).toBeNull();
    vi.useRealTimers();
  });

  it("contains a prewarm failure without exposing a session for adoption", async () => {
    const session = fakeSession();
    vi.mocked(session.prepareTransport).mockRejectedValue(new Error("admission denied"));
    const controller = new WorldModelPrewarmController({ createSession: () => session });

    expect(await controller.prewarm({ scene: worldScene("failed"), strategy: "transport" })).toBe(false);
    expect(await controller.adopt("failed", "transport")).toBeNull();
    expect(session.disconnect).toHaveBeenCalledWith({ reason: "prewarm-failed", dispose: true });
  });
});
