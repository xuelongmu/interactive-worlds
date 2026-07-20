import { describe, expect, it, vi } from "vitest";
import {
  activeRunnerCanResumePointerInput,
  canPrewarmWorldModelTarget,
  CHAPTER_STING_URL,
  completeCutsceneHandoff,
  controlHandoffForScene,
  defaultGuidanceForCue,
  dispatchEngineEvent,
  Director,
  playCueAudio,
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

  it("keeps control identity separate from the contextual choice snapshot", () => {
    const handoff = controlHandoffForScene("delaware", 4, {
      renderer: "worldmodel",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
    });

    expect(handoff).toEqual({
      sceneId: "delaware",
      transitionKey: 4,
      renderer: "worldmodel",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
    });
  });

  it("does not infer contextual choices for an ordinary control handoff", () => {
    expect(controlHandoffForScene("trenton", 5, {
      renderer: "gameplay",
      controlsEnabled: true,
    })).toEqual({
      sceneId: "trenton",
      transitionKey: 5,
      renderer: "gameplay",
      controlsEnabled: true,
    });
  });
});

describe("Director deterministic beat-navigation seam", () => {
  const beats = [
    { index: 0, sceneId: "teaparty", cueId: "TEA-070", sceneIndex: 0, cueIndex: 6 },
    { index: 1, sceneId: "teaparty", cueId: "TEA-080", sceneIndex: 0, cueIndex: 7 },
    { index: 2, sceneId: "lexington", cueId: "LEX-010", sceneIndex: 1, cueIndex: 0 },
  ];

  function fakeDirector(activeIndex: number) {
    const director = Object.create(Director.prototype) as any;
    const order: string[] = [];
    director.narrativeBeats = beats;
    director.activeBeat = beats[activeIndex];
    director.current = { id: beats[activeIndex].sceneId };
    director.controlTransitionKey = 9;
    director.sceneReady = true;
    director.paused = false;
    director.disposed = false;
    director.beatTransitioning = false;
    director.beatFeedback = null;
    director.beatNavigationPromise = null;
    director.opts = {
      onBeatNavigationResult: vi.fn(),
      onBeatNavigationSnapshot: vi.fn(),
    };
    director.publishBeatNavigation = vi.fn();
    director.publishContextualChoice = vi.fn();
    director.teardownScene = vi.fn(async () => { order.push("cleanup"); });
    director.runScene = vi.fn(async (sceneId: string, cueId: string, skip: boolean) => {
      order.push(`enter:${sceneId}:${cueId}:${skip}`);
      director.current = { id: sceneId };
      director.activeBeat = beats.find((beat) => beat.sceneId === sceneId && beat.cueId === cueId);
      director.controlTransitionKey += 1;
    });
    return { director, order };
  }

  it("moves one beat forward within a scene and one beat back from a chapter boundary", async () => {
    const forward = fakeDirector(0);
    const nextRequest = { type: "nextBeat", sceneId: "teaparty", transitionKey: 9 } as const;
    await expect(forward.director.nextBeat(nextRequest)).resolves.toEqual({ outcome: "navigated", request: nextRequest });
    expect(forward.order).toEqual(["cleanup", "enter:teaparty:TEA-080:true"]);

    const backward = fakeDirector(2);
    const previousRequest = { type: "previousBeat", sceneId: "lexington", transitionKey: 9 } as const;
    await expect(backward.director.previousBeat(previousRequest)).resolves.toEqual({ outcome: "navigated", request: previousRequest });
    expect(backward.order).toEqual(["cleanup", "enter:teaparty:TEA-080:true"]);
  });

  it("crosses a chapter forward without skipping the first target beat", async () => {
    const { director, order } = fakeDirector(1);
    const request = { type: "nextBeat", sceneId: "teaparty", transitionKey: 9 } as const;
    await director.nextBeat(request);
    expect(order).toEqual(["cleanup", "enter:lexington:LEX-010:true"]);
  });

  it("clamps both global ends and rejects stale or repeated requests without cleanup", async () => {
    const first = fakeDirector(0);
    const previous = { type: "previousBeat", sceneId: "teaparty", transitionKey: 9 } as const;
    await expect(first.director.previousBeat(previous)).resolves.toMatchObject({ outcome: "clamped" });
    expect(first.order).toEqual([]);

    const last = fakeDirector(2);
    const next = { type: "nextBeat", sceneId: "lexington", transitionKey: 9 } as const;
    await expect(last.director.nextBeat(next)).resolves.toMatchObject({ outcome: "clamped" });
    const stale = { ...next, transitionKey: 8 };
    await expect(last.director.nextBeat(stale)).resolves.toMatchObject({ outcome: "error", message: "The beat navigation request is stale." });
    last.director.beatNavigationPromise = Promise.resolve({ outcome: "navigated", request: next });
    await expect(last.director.nextBeat(next)).resolves.toMatchObject({ outcome: "error", message: "A beat transition is already in progress." });
    expect(last.order).toEqual([]);
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

describe("Director editorial music sequencing", () => {
  it("finishes narration, then music, before the cue transition can run", async () => {
    const order: string[] = [];
    let finishNarration!: () => void;
    const audio = {
      capturePlaybackGeneration: vi.fn(() => 0),
      isPlaybackGenerationCurrent: vi.fn(() => true),
      playVoice: vi.fn(() => new Promise<void>((resolve) => { finishNarration = resolve; })),
      playOneShotAndWait: vi.fn(async () => { order.push("music"); }),
    };
    const cue = {
      id: "TEST-MUSIC",
      trigger: { type: "scene-start" as const },
      subtitle: "A final line.",
      musicAfter: "/assets/audio/music/swell-test.mp3",
    };

    const playback = playCueAudio(audio, cue);
    await vi.waitFor(() => expect(audio.playVoice).toHaveBeenCalledOnce());
    expect(audio.playOneShotAndWait).not.toHaveBeenCalled();
    order.push("narration");
    finishNarration();
    await playback;
    order.push("transition");

    expect(order).toEqual(["narration", "music", "transition"]);
    expect(audio.playOneShotAndWait).toHaveBeenCalledWith(cue.musicAfter);
  });

  it("does not launch the old swell when Pause -> Restart cancels narration", async () => {
    let finishNarration!: () => void;
    let generation = 0;
    const audio = {
      capturePlaybackGeneration: vi.fn(() => generation),
      isPlaybackGenerationCurrent: vi.fn((captured: number) => captured === generation),
      playVoice: vi.fn(() => new Promise<void>((resolve) => { finishNarration = resolve; })),
      playOneShotAndWait: vi.fn().mockResolvedValue(undefined),
    };
    const cue = {
      id: "TEST-RESTART-MUSIC",
      trigger: { type: "scene-start" as const },
      subtitle: "The old chapter's final line.",
      musicAfter: "/assets/audio/music/swell-test.mp3",
    };

    const playback = playCueAudio(audio, cue);
    await vi.waitFor(() => expect(audio.playVoice).toHaveBeenCalledOnce());
    // teardownScene() calls stopAll(); the interrupted voice reports that its
    // playback generation was invalidated once restart releases the pause.
    generation++;
    finishNarration();
    await playback;

    expect(audio.playOneShotAndWait).not.toHaveBeenCalled();
  });

  it("uses the approved score's chapter sting on title cards", () => {
    expect(CHAPTER_STING_URL).toBe("/assets/audio/music/chapter-sting.mp3");
  });
});
