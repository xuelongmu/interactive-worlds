import { describe, expect, it, vi } from "vitest";
import { AudioEngine, type BusName } from "./audio";

describe("AudioEngine narration contract", () => {
  it("holds the subtitle for playback and ducks ambience by 6 dB", async () => {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(() => queueMicrotask(() => source.onended?.())),
    };
    const gains = new Map<BusName, ReturnType<typeof vi.fn>>();
    for (const bus of ["narration", "diegetic", "ambience", "music"] as BusName[]) {
      gains.set(bus, vi.fn());
    }

    const engine = new AudioEngine() as any;
    engine.ctx = {
      currentTime: 4,
      createBufferSource: () => source,
    };
    engine.buses = new Map(
      [...gains].map(([bus, setTargetAtTime]) => [bus, { gain: { setTargetAtTime } }])
    );
    engine.load = vi.fn().mockResolvedValue({ duration: 1 });
    const subtitles = vi.fn();
    engine.onSubtitle = subtitles;

    await engine.playVoice({ url: "/voice.mp3", subtitle: "A measured line." });

    expect(subtitles.mock.calls).toEqual([["A measured line."], [null]]);
    expect(gains.get("ambience")).toHaveBeenNthCalledWith(
      1,
      expect.closeTo(Math.pow(10, -6 / 20), 8),
      4,
      0.15
    );
    expect(gains.get("ambience")).toHaveBeenNthCalledWith(2, 1, 4, 0.15);
  });

  it("does not duck ambience for a diegetic line", async () => {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(() => queueMicrotask(() => source.onended?.())),
    };
    const ambienceGain = vi.fn();
    const engine = new AudioEngine() as any;
    engine.ctx = { currentTime: 0, createBufferSource: () => source };
    engine.buses = new Map([
      ["narration", { gain: { setTargetAtTime: vi.fn() } }],
      ["diegetic", { gain: { setTargetAtTime: vi.fn() } }],
      ["ambience", { gain: { setTargetAtTime: ambienceGain } }],
      ["music", { gain: { setTargetAtTime: vi.fn() } }],
    ]);
    engine.load = vi.fn().mockResolvedValue({ duration: 1 });

    await engine.playVoice({
      url: "/diegetic.mp3",
      subtitle: "Pole off the bow!",
      bus: "diegetic",
      duck: [],
    });

    expect(ambienceGain).not.toHaveBeenCalled();
  });
});
