import { describe, expect, it, vi } from "vitest";
import { CueEngine } from "./cues";
import type { Cue } from "./types";

const cue: Cue = {
  id: "TEST-010",
  trigger: { type: "scene-start" },
  subtitle: "Test line",
};

describe("CueEngine teardown", () => {
  it("suppresses an in-flight after hook when stop is called", async () => {
    let finishPlayback!: () => void;
    const playback = new Promise<void>((resolve) => { finishPlayback = resolve; });
    const after = vi.fn();
    const engine = new CueEngine([cue], { play: () => playback, after });

    engine.handleEvent({ type: "scene-start" });
    engine.stop();
    finishPlayback();
    await playback;
    await Promise.resolve();

    expect(after).not.toHaveBeenCalled();
  });

  it("runs the after hook when playback completes normally", async () => {
    const after = vi.fn();
    const engine = new CueEngine([cue], {
      play: () => Promise.resolve(),
      after,
    });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(after).toHaveBeenCalledOnce());
  });

  it("serializes an asynchronous after hook before the next queued cue", async () => {
    let finishAfter!: () => void;
    const after = vi.fn(() => new Promise<void>((resolve) => { finishAfter = resolve; }));
    const play = vi.fn().mockResolvedValue(undefined);
    const next = { ...cue, id: "TEST-020" };
    const engine = new CueEngine([cue, next], { play, after });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
    expect(play).toHaveBeenCalledTimes(1);
    finishAfter();
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });
});

describe("CueEngine pacing and review controls", () => {
  it("fires a missed spatial beat shortly after the previous cue completes", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const cues: Cue[] = [
      cue,
      {
        id: "TEST-020",
        trigger: { type: "dwell", zone: "gangway", seconds: 30, orAfterPrevious: 3 },
        subtitle: "The next beat",
      },
    ];
    const engine = new CueEngine(cues, { play });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    engine.update(2.9);
    expect(play).toHaveBeenCalledTimes(1);
    engine.update(0.2);
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it("does not report a completed dwell when its fallback fires instead", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const samples: { id: string }[] = [];
    const cues: Cue[] = [
      cue,
      {
        id: "TEST-020",
        trigger: { type: "dwell", zone: "gangway", seconds: 30, orAfterPrevious: 1 },
        subtitle: "Fallback beat",
      },
    ];
    const engine = new CueEngine(cues, {
      play,
      onTimingSample: (sample) => samples.push(sample),
    }, { sceneId: "test" });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    engine.update(1);
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    expect(samples.some(({ id }) => id === "test:TEST-020:event-to-cue")).toBe(false);
  });

  it("exposes and fires the next pending cue for development review", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const next: Cue = {
      id: "TEST-020",
      trigger: { type: "action", name: "continue" },
      subtitle: "Continue",
    };
    const engine = new CueEngine([cue, next], { play });

    expect(engine.nextPendingCue()?.id).toBe("TEST-010");
    expect(engine.fireNextPending()?.id).toBe("TEST-010");
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(engine.nextPendingCue()?.id).toBe("TEST-020");
    expect(engine.fireNextPending()?.id).toBe("TEST-020");
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(engine.nextPendingCue()).toBeUndefined();
  });

  it("dispatches afterEventSeconds on the pause-aware cue clock and reports the handoff", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const samples: unknown[] = [];
    const delayed: Cue = {
      id: "TEST-DELAYED",
      trigger: { type: "action", name: "complete", afterEventSeconds: 4 },
      subtitle: "After the authored silence.",
    };
    const engine = new CueEngine([delayed], {
      play,
      onTimingSample: (sample) => samples.push(sample),
    }, { sceneId: "lexington" });

    engine.handleEvent({ type: "action", name: "complete" });
    engine.update(3.9);
    expect(play).not.toHaveBeenCalled();
    engine.update(0.1);
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());

    expect(samples).toEqual([expect.objectContaining({
      id: "lexington:TEST-DELAYED:event-to-cue",
      from: "interaction-complete",
      gapMs: 4_000,
    })]);
  });

  it("drops a delayed event cue when scene teardown wins", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const delayed: Cue = {
      id: "TEST-DELAYED-STOP",
      trigger: { type: "action", name: "complete", afterEventSeconds: 4 },
      subtitle: "Stale line.",
    };
    const engine = new CueEngine([delayed], { play });

    engine.handleEvent({ type: "action", name: "complete" });
    engine.stop();
    engine.update(5);

    expect(play).not.toHaveBeenCalled();
    expect(engine.timingSnapshot()).toEqual([]);
  });

  it("uses configurable narrator spacing without doubling elapsed authored fallback time", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const waitForVoiceGap = vi.fn().mockResolvedValue(true);
    const next: Cue = {
      id: "TEST-020",
      trigger: { type: "timer", seconds: 60, orAfterPrevious: 0.5 },
      subtitle: "The next line.",
    };
    const engine = new CueEngine([cue, next], { play, waitForVoiceGap }, {
      voiceSpacing: { diegeticToNarratorMs: 750, narratorToNarratorMs: 500 },
    });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    engine.update(0.5);
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    expect(waitForVoiceGap).not.toHaveBeenCalled();
  });

  it("waits the remaining narrator gap and honors explicit interruption", async () => {
    const waitForVoiceGap = vi.fn().mockResolvedValue(true);
    const play = vi.fn().mockResolvedValue(undefined);
    const second: Cue = { ...cue, id: "TEST-020" };
    const engine = new CueEngine([cue, second], { play, waitForVoiceGap }, {
      voiceSpacing: { diegeticToNarratorMs: 750, narratorToNarratorMs: 650 },
    });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(waitForVoiceGap).toHaveBeenCalledWith(650);

    const interruptedWait = vi.fn().mockResolvedValue(true);
    const interruptedPlay = vi.fn().mockResolvedValue(undefined);
    const interrupted = { ...second, interruption: true };
    const interruptedEngine = new CueEngine([cue, interrupted], {
      play: interruptedPlay,
      waitForVoiceGap: interruptedWait,
    });
    interruptedEngine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(interruptedPlay).toHaveBeenCalledTimes(2));
    expect(interruptedWait).not.toHaveBeenCalled();
  });

  it("does not start queued narration when teardown invalidates its voice gap", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const waitForVoiceGap = vi.fn().mockResolvedValue(false);
    const engine = new CueEngine([cue, { ...cue, id: "TEST-020" }], {
      play,
      waitForVoiceGap,
    });

    engine.handleEvent({ type: "scene-start" });
    await vi.waitFor(() => expect(waitForVoiceGap).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(play).toHaveBeenCalledOnce();
  });
});
