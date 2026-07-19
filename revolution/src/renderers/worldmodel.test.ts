import { afterEach, describe, expect, it, vi } from "vitest";
import type { LingbotWorld2Message, LingbotWorld2Model } from "@reactor-models/lingbot-world-2";
import {
  canDispatchWorldModelAction,
  frameHasVisibleContent,
  isGroundedWorldModelEvent,
  isWorldModelActionKey,
  ModelEventTimeline,
  resolveWorldModelPointerLook,
  ROLLOVER_OUTPUT_BUDGET_MS,
  WorldModelPresentationGate,
  WorldModelRolloverGate,
  WorldModelScenePlayer,
  WorldModelSession,
} from "./worldmodel";

type Handler<T = unknown> = (value: T) => void;

class FakeModel {
  calls: string[] = [];
  status = "disconnected";
  autoReady = true;
  autoConditions = true;
  autoStart = true;
  connectPromise: Promise<void> | null = null;
  private events = new Map<string, Set<Handler>>();
  private messages = new Set<Handler<LingbotWorld2Message>>();
  private imageAccepted = new Set<Handler<any>>();
  private conditionsReady = new Set<Handler<any>>();

  on(event: string, handler: Handler) {
    this.calls.push(`listen:${event}`);
    const handlers = this.events.get(event) ?? new Set();
    handlers.add(handler);
    this.events.set(event, handlers);
  }
  off(event: string, handler: Handler) { this.events.get(event)?.delete(handler); }
  onMainVideo(_handler: Handler) { this.calls.push("listen:video"); return () => undefined; }
  onMessage(handler: Handler<LingbotWorld2Message>) {
    this.calls.push("listen:message");
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onImageAccepted(handler: Handler) {
    this.calls.push("listen:image");
    this.imageAccepted.add(handler);
    return () => this.imageAccepted.delete(handler);
  }
  onConditionsReady(handler: Handler) {
    this.calls.push("listen:conditions");
    this.conditionsReady.add(handler);
    return () => this.conditionsReady.delete(handler);
  }
  getStatus() { return this.status; }
  async connect() {
    this.calls.push("connect");
    if (this.connectPromise) await this.connectPromise;
    if (this.autoReady) {
      this.status = "ready";
      this.emitEvent("statusChanged", "ready");
    }
  }
  async uploadFile() { this.calls.push("upload"); return { id: "ref" } as any; }
  async setImage() {
    this.calls.push("setImage");
    this.emit({ type: "image_accepted", width: 1664, height: 960 });
    this.emit({ type: "conditions_ready", has_image: true, has_prompt: false });
  }
  async setPrompt({ prompt }: { prompt?: string }) {
    this.calls.push(`setPrompt:${prompt ?? ""}`);
    if (this.autoConditions) {
      this.emit({ type: "prompt_accepted", prompt: prompt ?? "" });
      this.emit({ type: "conditions_ready", has_image: true, has_prompt: true });
    }
  }
  async start() {
    this.calls.push("start");
    if (this.autoStart) this.emit({
      type: "generation_started",
      prompt: "scene",
      chunk_num: 8,
      frame_num: 128,
    });
  }
  async disconnect() { this.calls.push("disconnect"); }
  async setMoveLongitudinal({ move_longitudinal }: { move_longitudinal?: string }) {
    this.calls.push(`move-long:${move_longitudinal}`);
  }
  async setMoveLateral({ move_lateral }: { move_lateral?: string }) {
    this.calls.push(`move-lateral:${move_lateral}`);
  }
  async setLookHorizontal({ look_horizontal }: { look_horizontal?: string }) {
    this.calls.push(`look-h:${look_horizontal}`);
  }
  async setLookVertical({ look_vertical }: { look_vertical?: string }) {
    this.calls.push(`look-v:${look_vertical}`);
  }
  getConnectionTimings() { return undefined; }
  getStats() { return undefined; }
  getSessionId() { return "session-id"; }
  async requestRecording() { return {}; }
  async downloadClipAsFile() { return new Blob(); }

  emit(message: LingbotWorld2Message) {
    if (message.type === "image_accepted") {
      for (const handler of this.imageAccepted) handler(message);
    }
    if (message.type === "conditions_ready") {
      for (const handler of this.conditionsReady) handler(message);
    }
    for (const handler of this.messages) handler(message);
  }

  emitEvent(event: string, value: unknown) {
    for (const handler of this.events.get(event) ?? []) handler(value);
  }

  temporaryListenerCount() {
    return this.imageAccepted.size + this.conditionsReady.size;
  }
}

function makeSession(model = new FakeModel()) {
  const telemetry = vi.fn();
  const session = new WorldModelSession({
    mintJwt: async () => { model.calls.push("mint"); return "jwt"; },
    onTelemetry: telemetry,
    timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, begin: 100 },
  }, model as unknown as LingbotWorld2Model);
  return { model, session, telemetry };
}

describe("WorldModelSession lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prepares transport and conditions without starting generation", async () => {
    const { model, session } = makeSession();
    await session.prepare(new Blob(["frame"]), "winter river");

    expect(session.phase).toBe("prepared");
    expect(model.calls).toEqual([
      "listen:statusChanged", "listen:video", "listen:message",
      "mint", "connect", "listen:image", "listen:conditions",
      "upload", "setImage", "setPrompt:winter river",
    ]);
    expect(model.calls).not.toContain("start");
    expect(model.temporaryListenerCount()).toBe(0);
  });

  it("begins once after preparation and exposes streaming state", async () => {
    const { model, session } = makeSession();
    await session.prepare(new Blob(), "scene");
    await Promise.all([session.begin(), session.begin()]);

    expect(model.calls.filter((call) => call === "start")).toHaveLength(1);
    expect(session.phase).toBe("streaming");
  });

  it("cleans condition listeners and fails on a bounded timeout", async () => {
    vi.useFakeTimers();
    const model = new FakeModel();
    model.autoConditions = false;
    const { session } = makeSession(model);
    await session.prepareTransport();
    const conditioning = session.condition(new Blob(), "scene");
    const rejection = expect(conditioning).rejects.toThrow("conditions_ready timeout");
    await vi.advanceTimersByTimeAsync(101);

    await rejection;
    expect(session.phase).toBe("failed");
    expect(model.temporaryListenerCount()).toBe(0);
  });

  it("invalidates a transport continuation disposed between awaits", async () => {
    let resolveConnect = () => {};
    const model = new FakeModel();
    model.connectPromise = new Promise<void>((resolve) => { resolveConnect = resolve; });
    const { session } = makeSession(model);
    const preparation = session.prepareTransport();
    await Promise.resolve();
    await session.disconnect({ dispose: true, reason: "navigation" });
    resolveConnect();

    await expect(preparation).rejects.toThrow("stale or disposed");
    expect(session.phase).toBe("disposed");
    expect(model.calls).not.toContain("upload");
    expect(model.calls).not.toContain("start");
  });

  it("retains only the latest input intent until presentation", async () => {
    const { model, session } = makeSession();
    await session.prepare(new Blob(), "scene");
    await session.setMovement("forward", "strafe_left");
    await session.setMovement("back", "strafe_right");
    await session.setLook("left", "up");
    await session.setLook("right", "down");

    expect(model.calls.some((call) => call.startsWith("move-"))).toBe(false);
    await session.setInputEnabled(true);
    expect(model.calls.filter((call) => call.startsWith("move-") || call.startsWith("look-"))).toEqual([
      "move-long:back",
      "move-lateral:strafe_right",
      "look-h:right",
      "look-v:down",
    ]);
  });

  it("deterministically stops translation at a grounded/landed boundary", async () => {
    const { model, session } = makeSession();
    await session.prepare(new Blob(), "scene");
    await session.setInputEnabled(true);
    await session.setMovement("forward", "idle");
    await session.setMovementEnabled(false);
    await session.setMovement("forward", "strafe_left");

    expect(model.calls.filter((call) => call.startsWith("move-"))).toEqual([
      "move-long:forward",
      "move-long:idle",
    ]);
    expect(isGroundedWorldModelEvent("landing")).toBe(true);
    expect(isGroundedWorldModelEvent("landed")).toBe(true);
    expect(isGroundedWorldModelEvent("storm")).toBe(false);
  });

  it("treats generation completion as automatic rollover without restarting", async () => {
    const { model, session, telemetry } = makeSession();
    await session.prepare(new Blob(), "scene");
    await session.begin();
    model.emit({ type: "generation_complete", total_chunks: 8 });
    expect(session.phase).toBe("recycling");
    model.emit({ type: "generation_started", prompt: "scene", chunk_num: 8, frame_num: 128 });
    expect(session.phase).toBe("recycling");
    model.emit({ type: "chunk_complete", chunk_index: 0, active_action: "still", active_prompt: "scene", frames_emitted: 16 });

    expect(session.phase).toBe("streaming");
    expect(model.calls.filter((call) => call === "start")).toHaveLength(1);
    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ name: "generation-rollover-gap" }));
  });

  it("disconnects idempotently", async () => {
    const { model, session } = makeSession();
    await session.prepareTransport();
    await Promise.all([session.disconnect(), session.disconnect()]);
    expect(model.calls.filter((call) => call === "disconnect")).toHaveLength(1);
    expect(session.phase).toBe("stopped");
  });

  it("uses an authenticated keepalive termination request on pagehide", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { model, session } = makeSession();
    await session.prepareTransport();

    (session as any).onPageHide();
    await Promise.resolve();

    expect(session.phase).toBe("disposed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.reactor.inc/sessions/session-id",
      expect.objectContaining({
        method: "DELETE",
        keepalive: true,
        headers: expect.objectContaining({ Authorization: "Bearer jwt" }),
      })
    );
    expect(model.calls).toContain("disconnect");
  });
});

describe("presentation and rollover gates", () => {
  it("rejects a pending presentation deadline when disposal cancels waits", async () => {
    vi.stubGlobal("window", globalThis);
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.timers = new Set();
    player.pendingWaits = new Set();
    const deadline = player.withDeadline(new Promise(() => {}), 10_000, "timed out");
    const rejection = expect(deadline).rejects.toThrow("disposed");
    player.cancelPendingWaits(new Error("disposed"));
    await rejection;
    vi.unstubAllGlobals();
  });

  it("presents live exactly once only after start, frame, and chunk", async () => {
    const presented = vi.fn();
    const gate = new WorldModelPresentationGate(presented);
    gate.markGenerationStarted();
    gate.markChunkProduced();
    expect(presented).not.toHaveBeenCalled();
    gate.markFrameDisplayed();
    gate.markFallbackReady();
    await gate.ready;
    expect(presented).toHaveBeenCalledOnce();
    expect(presented).toHaveBeenCalledWith("live");
  });

  it("allows fallback to win a started-without-frame race exactly once", async () => {
    const presented = vi.fn();
    const gate = new WorldModelPresentationGate(presented);
    gate.markGenerationStarted();
    gate.markChunkProduced();
    gate.markFallbackReady();
    gate.markFrameDisplayed();
    await gate.ready;
    expect(presented).toHaveBeenCalledOnce();
    expect(presented).toHaveBeenCalledWith("fallback");
  });

  it("masks rollover until the successor run has a fresh frame and chunk", () => {
    const mask = vi.fn();
    const reveal = vi.fn();
    const gate = new WorldModelRolloverGate({ mask, reveal });
    gate.markGenerationComplete();
    gate.markFrameDisplayed();
    gate.markGenerationStarted();
    gate.markFrameDisplayed();
    expect(reveal).not.toHaveBeenCalled();
    gate.markChunkProduced();
    expect(mask).toHaveBeenCalledOnce();
    expect(reveal).toHaveBeenCalledOnce();
  });

  it("classifies persistent black frames while preserving low-light detail", () => {
    const black = new Uint8ClampedArray(100 * 4);
    for (let index = 3; index < black.length; index += 4) black[index] = 255;
    expect(frameHasVisibleContent(black)).toBe(false);

    const lowLight = black.slice();
    lowLight[0] = 12;
    expect(frameHasVisibleContent(lowLight)).toBe(true);
  });

  it("masks persistent black output and falls back on the second bad sample", () => {
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.healthSamplePending = false;
    player.runtimeFallbackStarted = false;
    player.blackFrameSamples = 0;
    player.rollover = { recycling: false };
    player.armVideoFrame = (callback: () => void) => callback();
    player.currentFrameIsUsable = () => false;
    player.showPoster = vi.fn();
    player.fallBackFromLive = vi.fn();

    player.monitorPresentedFrame();
    expect(player.showPoster).toHaveBeenCalledOnce();
    expect(player.fallBackFromLive).not.toHaveBeenCalled();
    player.monitorPresentedFrame();
    expect(player.fallBackFromLive).toHaveBeenCalledWith("persistent black Reactor output");
  });

  it("falls back when rollover has no usable output within ten seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.rolloverDeadline = null;
    player.timers = new Set();
    player.fallBackFromLive = vi.fn().mockResolvedValue(undefined);
    player.armRolloverDeadline();

    await vi.advanceTimersByTimeAsync(ROLLOVER_OUTPUT_BUDGET_MS - 1);
    expect(player.fallBackFromLive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(player.fallBackFromLive).toHaveBeenCalledWith(
      expect.stringContaining(`${ROLLOVER_OUTPUT_BUDGET_MS}ms`),
      ROLLOVER_OUTPUT_BUDGET_MS
    );
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps direct mouse look and contextual action bindings", () => {
    expect(resolveWorldModelPointerLook(8, -4)).toEqual({ h: "right", v: "up" });
    expect(resolveWorldModelPointerLook(-8, 4)).toEqual({ h: "left", v: "down" });
    expect(resolveWorldModelPointerLook(0, 0)).toEqual({ h: "idle", v: "idle" });
    expect(["KeyE", "Space", "Enter"].every(isWorldModelActionKey)).toBe(true);
    expect(isWorldModelActionKey("KeyW")).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", false, false)).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", true, true)).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", true, false)).toBe(true);
  });
});

describe("scripted event continuity", () => {
  it("does not reset or re-emit story events across generation runs", () => {
    const emit = vi.fn();
    const timeline = new ModelEventTimeline([{ at: 1, name: "beat" }], { emit, steer: vi.fn() });
    timeline.update(2);
    timeline.update(2);
    expect(emit).toHaveBeenCalledOnce();
  });

  it("still emits an authored beat when prompt steering fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onEvent = vi.fn();
    const model = new FakeModel();
    model.setPrompt = vi.fn().mockRejectedValue(new Error("transient command failure"));
    const session = new WorldModelSession({ onEvent }, model as unknown as LingbotWorld2Model);
    await session.steer("landing", "reach the riverbank");
    expect(onEvent).toHaveBeenCalledWith({ type: "model-event", name: "landing" });
  });
});
