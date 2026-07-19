import { describe, expect, it, vi } from "vitest";
import type { EngineEvent, SceneManifest } from "../engine/types";
import {
  SoundDesignController,
  claimAdapterAmbience,
  soundDesignPlan,
  validateSoundDesignPlan,
  type SoundAsset,
  type SoundBus,
  type SoundCue,
  type SoundPlaybackPort,
} from "./sound-design";

class FakePlayback implements SoundPlaybackPort {
  ensure = vi.fn();
  play = vi.fn<(cue: SoundCue, asset: SoundAsset) => void>();
  stopCue = vi.fn<(cueId: string, fadeOutMs: number) => void>();
  stopBuses = vi.fn<(buses: readonly SoundBus[], fadeOutMs: number) => void>();
  stopAll = vi.fn<(fadeOutMs?: number) => void>();
  setNarrationActive = vi.fn<(active: boolean) => void>();
  setPaused = vi.fn<(paused: boolean) => void>();
  dispose = vi.fn();
}

const sceneStart: EngineEvent = { type: "scene-start" };

describe("sound design event adapter", () => {
  it("starts adapter ambience once and tears down on the next scene", () => {
    const playback = new FakePlayback();
    const controller = new SoundDesignController(playback);

    controller.onEngineEvent(sceneStart, "lexington");
    controller.onEngineEvent(sceneStart, "lexington");
    controller.onEngineEvent(sceneStart, "treaty-paris");

    expect(playback.play.mock.calls.map(([cue]) => cue.id)).toEqual([
      "LEX-AMB-001",
      "PAR-AMB-001",
    ]);
    expect(playback.stopAll).toHaveBeenCalledTimes(2);
  });

  it("fires one-shot cues once and repeatable interaction cues within limits", () => {
    let now = 0;
    const playback = new FakePlayback();
    const controller = new SoundDesignController(playback, () => now);
    controller.onEngineEvent(sceneStart, "teaparty");

    controller.onEngineEvent({ type: "model-event", name: "chest-open" }, "teaparty");
    controller.onEngineEvent({ type: "model-event", name: "chest-open" }, "teaparty");
    controller.onEngineEvent({ type: "model-event", name: "chest-work" }, "teaparty");
    now = 1000;
    controller.onEngineEvent({ type: "model-event", name: "chest-work" }, "teaparty");
    for (let index = 0; index < 5; index++) {
      now += 3000;
      controller.onEngineEvent({ type: "model-event", name: "chest-work" }, "teaparty");
    }

    const ids = playback.play.mock.calls.map(([cue]) => cue.id);
    expect(ids.filter((id) => id === "TEA-SFX-001")).toHaveLength(1);
    expect(ids.filter((id) => id === "TEA-SFX-002")).toHaveLength(4);
  });

  it("latches interaction SFX off at completion without a synthetic deck-clear event", () => {
    const playback = new FakePlayback();
    const controller = new SoundDesignController(playback);
    controller.onEngineEvent(sceneStart, "teaparty");
    controller.onEngineEvent({ type: "model-event", name: "chest-work" }, "teaparty");
    controller.onEngineEvent({ type: "model-event", name: "chests-done" }, "teaparty");
    controller.onEngineEvent({ type: "model-event", name: "chest-work" }, "teaparty");

    expect(playback.stopCue).toHaveBeenCalledWith("TEA-SFX-002", 300);
    expect(playback.stopCue).not.toHaveBeenCalledWith("TEA-SFX-003", expect.any(Number));
    expect(playback.play.mock.calls.map(([cue]) => cue.id)).toEqual([
      "TEA-SFX-002",
      "TEA-SFX-003",
    ]);
  });

  it("forwards narration ducking and pause state to the playback buses", () => {
    const playback = new FakePlayback();
    const controller = new SoundDesignController(playback);
    controller.setNarrationActive(true);
    controller.setNarrationActive(false);
    controller.setPaused(true);
    controller.setPaused(false);

    expect(playback.setNarrationActive.mock.calls).toEqual([[true], [false]]);
    expect(playback.setPaused.mock.calls).toEqual([[true], [false]]);
  });
});

describe("sound design invariants", () => {
  it("keeps plan references valid, silence asset-free, and generated buses music-free", () => {
    expect(() => validateSoundDesignPlan(soundDesignPlan)).not.toThrow();
    expect(soundDesignPlan.policy.generatedBuses).toEqual(["ambience", "diegetic", "sfx"]);
    for (const scene of soundDesignPlan.scenes) {
      for (const cue of scene.cues) {
        if (cue.kind === "authored-silence") expect(cue.asset).toBeNull();
      }
    }
  });

  it("makes the Redoubt 10 asset explicitly musket-, gunshot-, voice-, and music-free", () => {
    const prompt = soundDesignPlan.assets
      .find((asset) => asset.file === "sfx/redoubt-bayonet-assault.mp3")!.prompt.toLowerCase();
    expect(prompt).toContain("no muskets");
    expect(prompt).toContain("no gunshots");
    expect(prompt).toContain("no music");
    expect(prompt).toContain("no human voices");
  });

  it("keeps TEA-080 interaction-silent without a deck-clear model event", () => {
    const tea = soundDesignPlan.scenes.find((scene) => scene.id === "teaparty")!;
    const completion = tea.cues.find((cue) => cue.id === "TEA-SFX-003")!;
    const silence = tea.cues.find((cue) => cue.id === "TEA-SIL-001")!;
    const mappedEventNames = tea.cues.flatMap((cue) => [
      cue.trigger.name,
      cue.stop.type === "event" ? cue.stop.name : undefined,
    ]).filter(Boolean);

    expect(completion.trigger).toEqual({ type: "model-event", name: "chests-done" });
    expect(completion.stop).toEqual({ type: "natural-end" });
    expect(silence.trigger).toEqual({ type: "cue", cueId: "TEA-080" });
    expect(silence.runtimeOwner).toBe("handoff");
    expect(mappedEventNames).not.toContain("deck-clear");
  });

  it("claims adapter ambience in memory without editing unrelated manifest audio", () => {
    const lexington = {
      id: "lexington",
      audio: { ambience: ["/assets/audio/amb/green-dawn.mp3"] },
    } as SceneManifest;
    const declaration = {
      id: "declaration",
      audio: { ambience: ["/assets/audio/amb/assembly-room.mp3"] },
    } as SceneManifest;

    claimAdapterAmbience([lexington, declaration]);

    expect(lexington.audio.ambience).toEqual([]);
    expect(declaration.audio.ambience).toEqual(["/assets/audio/amb/assembly-room.mp3"]);
  });
});

