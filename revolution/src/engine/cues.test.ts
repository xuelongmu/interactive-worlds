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
});
