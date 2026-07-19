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
});
