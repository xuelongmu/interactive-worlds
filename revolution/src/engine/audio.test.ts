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

describe("AudioEngine positional diegetic playback", () => {
  it("routes a positioned one-shot through an HRTF panner", async () => {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(),
    };
    const panner = {
      connect: vi.fn(),
      panningModel: "equalpower",
      distanceModel: "linear",
      refDistance: 1,
      maxDistance: 10_000,
      rolloffFactor: 1,
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
    };
    const diegetic = {};
    const engine = new AudioEngine() as any;
    engine.ctx = {
      createBufferSource: () => source,
      createPanner: () => panner,
    };
    engine.buses = new Map([["diegetic", diegetic]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 1 });

    await engine.playOneShot("/drill.mp3", "diegetic", {
      position: [10, 1.7, -42],
      refDistance: 8,
      maxDistance: 80,
      rolloffFactor: 1.3,
    });

    expect(panner).toMatchObject({
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 8,
      maxDistance: 80,
      rolloffFactor: 1.3,
      positionX: { value: 10 },
      positionY: { value: 1.7 },
      positionZ: { value: -42 },
    });
    expect(source.connect).toHaveBeenCalledWith(panner);
    expect(panner.connect).toHaveBeenCalledWith(diegetic);
    expect(source.start).toHaveBeenCalledOnce();
  });
});

describe("AudioEngine editorial music", () => {
  it("awaits a music one-shot through its end event", async () => {
    let end!: () => void;
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(() => { end = () => source.onended?.(); }),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = { currentTime: 0, createBufferSource: () => source };
    engine.buses = new Map([["music", { gain: { setTargetAtTime: vi.fn() } }]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 2 });

    let finished = false;
    const playback = engine.playOneShotAndWait("/music.mp3").then(() => { finished = true; });
    await vi.waitFor(() => expect(source.start).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    end();
    await playback;

    expect(finished).toBe(true);
    expect(source.connect).toHaveBeenCalledWith(engine.buses.get("music"));
  });
});
