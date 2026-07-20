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
    engine.ctx = { state: "running", currentTime: 0, createBufferSource: () => source };
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

  it("reports cancellation when Pause -> Restart invalidates suspended narration", async () => {
    let state: "running" | "suspended" = "running";
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = {
      currentTime: 0,
      get state() { return state; },
      suspend: vi.fn(async () => { state = "suspended"; }),
      resume: vi.fn(async () => { state = "running"; }),
      createBufferSource: () => source,
    };
    engine.buses = new Map(
      (["narration", "diegetic", "ambience", "music"] as BusName[]).map((bus) => [
        bus,
        { gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() } },
      ])
    );
    engine.load = vi.fn().mockResolvedValue({ duration: 1 });
    const subtitles = vi.fn();
    engine.onSubtitle = subtitles;
    const generation = engine.capturePlaybackGeneration();

    const playback = engine.playVoice({ url: "/voice.mp3", subtitle: "A final line." });
    await vi.waitFor(() => expect(source.start).toHaveBeenCalledOnce());
    await engine.pause();
    engine.stopAll();
    await engine.resume();
    subtitles.mockClear();
    engine.onSubtitle("Restarted opening line.");
    source.onended?.();

    await playback;
    expect(engine.isPlaybackGenerationCurrent(generation)).toBe(false);
    expect(source.stop).toHaveBeenCalledOnce();
    expect(subtitles).toHaveBeenCalledOnce();
    expect(subtitles).toHaveBeenCalledWith("Restarted opening line.");
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
    engine.ctx = { state: "running", currentTime: 0, createBufferSource: () => source };
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

  it("skips a chapter sting when a suspended context cannot finish resuming", async () => {
    vi.useFakeTimers();
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = {
      state: "suspended",
      currentTime: 0,
      resume: vi.fn(() => new Promise<void>(() => {})),
      createBufferSource: () => source,
    };
    engine.buses = new Map([["music", {}]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 2 });

    let finished = false;
    const playback = engine.playOneShotAndWait("/chapter-sting.mp3").then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(finished).toBe(true);
    expect(source.start).not.toHaveBeenCalled();
    await playback;
    vi.useRealTimers();
  });

  it("contains resume rejection and continues without starting inaudible playback", async () => {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = {
      state: "suspended",
      currentTime: 0,
      resume: vi.fn().mockRejectedValue(new Error("audio output unavailable")),
      createBufferSource: () => source,
    };
    engine.buses = new Map([["music", {}]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 2 });

    await expect(engine.playOneShotAndWait("/chapter-sting.mp3")).resolves.toBeUndefined();
    expect(source.start).not.toHaveBeenCalled();
  });

  it("bounds playback that never emits an end event", async () => {
    vi.useFakeTimers();
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = { state: "running", currentTime: 0, createBufferSource: () => source };
    engine.buses = new Map([["music", {}]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 0.1 });

    let finished = false;
    const playback = engine.playOneShotAndWait("/chapter-sting.mp3").then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(source.start).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(finished).toBe(true);
    await playback;
    vi.useRealTimers();
  });

  it("keeps the next chapter audio behind an audible sting end event", async () => {
    let end!: () => void;
    const order: string[] = [];
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      onended: null as (() => void) | null,
      start: vi.fn(() => {
        order.push("sting-start");
        end = () => source.onended?.();
      }),
    };
    const engine = new AudioEngine() as any;
    engine.ctx = { state: "running", currentTime: 0, createBufferSource: () => source };
    engine.buses = new Map([["music", {}]]);
    engine.load = vi.fn().mockResolvedValue({ duration: 2 });

    const chapterStart = engine.playOneShotAndWait("/chapter-sting.mp3").then(() => {
      order.push("ambience-and-narration");
    });
    await vi.waitFor(() => expect(source.start).toHaveBeenCalledOnce());
    expect(order).toEqual(["sting-start"]);
    end();
    await chapterStart;

    expect(order).toEqual(["sting-start", "ambience-and-narration"]);
  });
});
