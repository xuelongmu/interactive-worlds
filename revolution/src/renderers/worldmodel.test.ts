import { afterEach, describe, expect, it, vi } from "vitest";
import type { LingbotWorld2Message, LingbotWorld2Model } from "@reactor-models/lingbot-world-2";
import { BRANCH_ACTION_MAPPINGS } from "../branch-state";
import {
  canDispatchWorldModelAction,
  bindWorldModelKeys,
  createReactorWorldModel,
  formatWorldModelError,
  frameHasVisibleContent,
  isGroundedWorldModelEvent,
  isReactorCapacityErrorStatus,
  isWorldModelActionKey,
  ModelEventTimeline,
  REACTOR_WORLD_MODELS,
  resolveLegacyLingbotMovement,
  resolveReactorWorldModelName,
  resolveWorldModelPointerLook,
  ROLLOVER_OUTPUT_BUDGET_MS,
  supportsReactorWorldNavigation,
  WorldModelPresentationGate,
  WorldModelRolloverGate,
  WorldModelScenePlayer,
  WorldModelSession,
} from "./worldmodel";

describe("Reactor world-model selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("allows the deployed URL to switch between the two navigable models", () => {
    expect(resolveReactorWorldModelName("?reactorModel=lingbot", "")).toBe(
      REACTOR_WORLD_MODELS.lingbot
    );
    expect(resolveReactorWorldModelName("?reactorModel=lingbot-world-2", "reactor/lingbot")).toBe(
      REACTOR_WORLD_MODELS["lingbot-world-2"]
    );
  });

  it("uses an allowlisted build default and fails unknown values back to World 2", () => {
    expect(resolveReactorWorldModelName("", "reactor/lingbot")).toBe(REACTOR_WORLD_MODELS.lingbot);
    expect(resolveReactorWorldModelName("?reactorModel=sana", "reactor/lingbot")).toBe(
      REACTOR_WORLD_MODELS["lingbot-world-2"]
    );
  });

  it("selects Helios only as a non-navigable cinematic model", () => {
    expect(resolveReactorWorldModelName("?reactorModel=helios", "")).toBe(
      REACTOR_WORLD_MODELS.helios
    );
    expect(supportsReactorWorldNavigation(REACTOR_WORLD_MODELS.helios)).toBe(false);
    expect(supportsReactorWorldNavigation(REACTOR_WORLD_MODELS.lingbot)).toBe(true);
  });

  it("commits Helios image and prompt atomically before generation", async () => {
    const model = createReactorWorldModel(REACTOR_WORLD_MODELS.helios) as any;
    const image = { uploadId: "reference" };
    model.setConditioning = vi.fn().mockResolvedValue(undefined);

    await model.setImage({ image });
    await model.setPrompt({ prompt: "historical scene" });

    expect(model.setConditioning).toHaveBeenCalledWith({ image, prompt: "historical scene" });
  });

  it("maps diagonal input deterministically onto legacy LingBot's single axis", () => {
    expect(resolveLegacyLingbotMovement("forward", "strafe_left")).toBe("forward");
    expect(resolveLegacyLingbotMovement("idle", "strafe_right")).toBe("strafe_right");
  });

  it("requests a JWT scoped to the selected model", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jwt: "jwt" }));
    vi.stubGlobal("fetch", fetchMock);

    await WorldModelSession.mintJwt(REACTOR_WORLD_MODELS.lingbot);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session?model=reactor%2Flingbot",
      { method: "POST" }
    );
  });

  it("recognizes an HTTP 503 without matching unrelated numbers", () => {
    expect(isReactorCapacityErrorStatus("token mint failed: 503 capacity exhausted")).toBe(true);
    expect(isReactorCapacityErrorStatus("error 1503")).toBe(false);
  });
});

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
  private generationReset = new Set<Handler<any>>();
  private promptAccepted = new Set<Handler<any>>();
  private stateHandlers = new Set<Handler<any>>();
  private input = {
    move_longitudinal: "idle",
    move_lateral: "idle",
    look_horizontal: "idle",
    look_vertical: "idle",
  };

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
  onGenerationReset(handler: Handler) {
    this.calls.push("listen:reset");
    this.generationReset.add(handler);
    return () => this.generationReset.delete(handler);
  }
  onPromptAccepted(handler: Handler) {
    this.calls.push("listen:prompt");
    this.promptAccepted.add(handler);
    return () => this.promptAccepted.delete(handler);
  }
  onState(handler: Handler) {
    this.calls.push("listen:state");
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
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
  async reset() {
    this.calls.push("reset");
    this.emit({ type: "generation_reset", reason: "test" });
    this.emitState();
  }
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
    this.input.move_longitudinal = move_longitudinal ?? "idle";
    this.emitState();
  }
  async setMoveLateral({ move_lateral }: { move_lateral?: string }) {
    this.calls.push(`move-lateral:${move_lateral}`);
    this.input.move_lateral = move_lateral ?? "idle";
    this.emitState();
  }
  async setLookHorizontal({ look_horizontal }: { look_horizontal?: string }) {
    this.calls.push(`look-h:${look_horizontal}`);
    this.input.look_horizontal = look_horizontal ?? "idle";
    this.emitState();
  }
  async setLookVertical({ look_vertical }: { look_vertical?: string }) {
    this.calls.push(`look-v:${look_vertical}`);
    this.input.look_vertical = look_vertical ?? "idle";
    this.emitState();
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
    if (message.type === "generation_reset") {
      for (const handler of this.generationReset) handler(message);
    }
    if (message.type === "prompt_accepted") {
      for (const handler of this.promptAccepted) handler(message);
    }
    if (message.type === "state") {
      for (const handler of this.stateHandlers) handler(message);
    }
    for (const handler of this.messages) handler(message);
  }

  emitState() {
    this.emit({
      type: "state",
      seed: 42,
      paused: false,
      running: false,
      started: false,
      has_image: true,
      has_prompt: true,
      ...this.input,
      current_chunk: 0,
      current_action: "still",
      current_prompt: "scene",
      camera_pose_active: false,
      rotation_speed_deg: 5,
    });
  }

  emitEvent(event: string, value: unknown) {
    for (const handler of this.events.get(event) ?? []) handler(value);
  }

  temporaryListenerCount() {
    return this.imageAccepted.size + this.conditionsReady.size + this.generationReset.size
      + this.promptAccepted.size + this.stateHandlers.size;
  }
}

class LegacyLingbotConditioningModel extends FakeModel {
  override emitState() {
    this.emit({
      type: "state",
      seed: 42,
      paused: false,
      running: false,
      started: false,
      movement: "idle",
      has_image: false,
      has_prompt: false,
      current_chunk: 0,
      look_horizontal: "idle",
      look_vertical: "idle",
      current_action: "still",
      current_prompt: null,
      rotation_speed_deg: 5,
    } as unknown as LingbotWorld2Message);
  }
}

class HeliosConditioningModel extends FakeModel {
  override onGenerationReset(_handler: Handler): never {
    throw new Error("Helios does not expose onGenerationReset");
  }

  override async reset() {
    this.calls.push("reset");
    this.emit({
      type: "state",
      paused: false,
      running: false,
      started: false,
      image_set: false,
      current_chunk: 0,
      current_frame: 0,
      current_prompt: null,
      image_strength: 1,
      scheduled_prompts: {},
    } as unknown as LingbotWorld2Message);
  }

  override async setImage() {
    this.calls.push("setImage");
  }

  override async setPrompt({ prompt }: { prompt?: string }) {
    this.calls.push(`setPrompt:${prompt ?? ""}`);
    this.emit({ type: "image_accepted", width: 1664, height: 960 });
    this.emit({ type: "prompt_accepted", prompt: prompt ?? "" });
    this.emit({ type: "conditions_ready", has_image: true, has_prompt: true });
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
    const commands = model.calls.filter((call) =>
      ["mint", "connect", "reset", "upload", "setImage"].includes(call)
      || call.startsWith("setPrompt:"));
    expect(commands.map((call) => call.startsWith("setPrompt:") ? "setPrompt" : call)).toEqual([
      "mint", "connect", "reset", "upload", "setImage", "setPrompt",
    ]);
    expect(model.calls).toContain("listen:error");
    expect(model.calls.find((call) => call.startsWith("setPrompt:"))).toContain("winter river");
    expect(model.calls).not.toContain("start");
    expect(model.temporaryListenerCount()).toBe(0);
  });

  it("conditions legacy Lingbot from its single movement state schema", async () => {
    const model = new LegacyLingbotConditioningModel();
    const readiness = vi.fn();
    const session = new WorldModelSession({
      modelName: REACTOR_WORLD_MODELS.lingbot,
      mintJwt: async () => "jwt",
      onBranchReadiness: readiness,
      timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, input: 100 },
    }, model as unknown as LingbotWorld2Model);

    await session.prepare(new Blob(["frame"]), "legacy scene");

    expect(session.phase).toBe("prepared");
    expect(readiness).toHaveBeenLastCalledWith({
      sessionConfirmed: true,
      imageConfirmed: true,
      promptConfirmed: true,
      inputConfirmed: true,
    });
    expect(model.temporaryListenerCount()).toBe(0);
  });

  it("conditions Helios from reset state and its atomic image/prompt command", async () => {
    const model = new HeliosConditioningModel();
    const readiness = vi.fn();
    const session = new WorldModelSession({
      modelName: REACTOR_WORLD_MODELS.helios,
      mintJwt: async () => "jwt",
      onBranchReadiness: readiness,
      timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, input: 100 },
    }, model as unknown as LingbotWorld2Model);

    await session.prepare(new Blob(["frame"]), "cinematic scene");

    expect(session.phase).toBe("prepared");
    expect(model.calls.indexOf("setImage")).toBeLessThan(
      model.calls.findIndex((call) => call.startsWith("setPrompt:")),
    );
    expect(readiness).toHaveBeenLastCalledWith({
      sessionConfirmed: true,
      imageConfirmed: true,
      promptConfirmed: true,
      inputConfirmed: true,
    });
    expect(model.temporaryListenerCount()).toBe(0);
  });

  it("begins once after preparation and exposes streaming state", async () => {
    const { model, session } = makeSession();
    await session.prepare(new Blob(), "scene");
    await Promise.all([session.begin(), session.begin()]);

    expect(model.calls.filter((call) => call === "start")).toHaveLength(1);
    expect(session.phase).toBe("streaming");
  });

  it("keeps the legacy cold-start helper interactive", async () => {
    const model = new FakeModel();
    const session = new WorldModelSession({
      referenceImage: new Blob(),
      prompt: "scene",
      mintJwt: async () => "jwt",
      timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, begin: 100 },
    }, model as unknown as LingbotWorld2Model);

    await session.connect();
    await session.setMovement("forward", "idle");

    expect(model.calls).toContain("move-long:forward");
  });

  it("cleans condition listeners and fails on a bounded timeout", async () => {
    vi.useFakeTimers();
    const model = new FakeModel();
    model.autoConditions = false;
    const { session } = makeSession(model);
    await session.prepareTransport();
    const conditioning = session.condition(new Blob(), "scene");
    const rejection = expect(conditioning).rejects.toThrow("prompt_accepted timeout");
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

  it("normalizes only backend prompt acceptance into one correlated branch confirmation", async () => {
    const model = new FakeModel();
    const runtimeEvents = vi.fn();
    const readiness = vi.fn();
    const session = new WorldModelSession({
      mintJwt: async () => "jwt",
      onBranchRuntimeEvent: runtimeEvents,
      onBranchReadiness: readiness,
      timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, begin: 100, input: 100 },
    }, model as unknown as LingbotWorld2Model);
    await session.prepare(new Blob(), "scene");
    await session.begin();
    await session.setInputEnabled(true);
    const mapping = BRANCH_ACTION_MAPPINGS[0];
    const request = { momentId: mapping.momentId, choiceId: mapping.choiceId, requestId: mapping.requestId };

    await session.requestBranchAction(request, "Hands hold the hatchet briefly.");
    expect(runtimeEvents).toHaveBeenCalledTimes(1);
    expect(runtimeEvents).toHaveBeenCalledWith({
      type: "branch-confirmed",
      id: mapping.confirmationEventId,
      requestId: mapping.requestId,
    });
    expect(readiness).toHaveBeenCalledWith({
      sessionConfirmed: true,
      imageConfirmed: true,
      promptConfirmed: true,
      inputConfirmed: true,
    });

    const lastPromptCall = [...model.calls].reverse().find((call: string) => call.startsWith("setPrompt:"))!;
    model.emit({ type: "prompt_accepted", prompt: lastPromptCall.slice(10) });
    expect(runtimeEvents).toHaveBeenCalledTimes(1);
  });

  it("normalizes correlated command_error and allows a clean retry", async () => {
    const model = new FakeModel();
    const runtimeEvents = vi.fn();
    const { session } = makeSession(model);
    session.attach({ onBranchRuntimeEvent: runtimeEvents });
    await session.prepare(new Blob(), "scene");
    await session.begin();
    await session.setInputEnabled(true);
    model.autoConditions = false;
    const mapping = BRANCH_ACTION_MAPPINGS[1];
    const request = { momentId: mapping.momentId, choiceId: mapping.choiceId, requestId: mapping.requestId };

    const failedRequest = session.requestBranchAction(request, "Hands hold the broom briefly.");
    const rejection = expect(failedRequest).rejects.toThrow("try again");
    await Promise.resolve();
    model.emit({ type: "command_error", command: "set_prompt", reason: "try again" });
    await rejection;
    expect(runtimeEvents).toHaveBeenCalledWith({
      type: "command_error",
      requestId: mapping.requestId,
      message: "try again",
    });
    model.autoConditions = true;
    await session.requestBranchAction(request, "Hands hold the broom briefly.");
    expect(runtimeEvents).toHaveBeenLastCalledWith({
      type: "branch-confirmed",
      id: mapping.confirmationEventId,
      requestId: mapping.requestId,
    });
  });

  it("bounds a missing branch acceptance, emits retryable correlation, and permits retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = new FakeModel();
    const runtimeEvents = vi.fn();
    const session = new WorldModelSession({
      mintJwt: async () => "jwt",
      onBranchRuntimeEvent: runtimeEvents,
      timeouts: { mint: 100, connect: 100, ready: 100, upload: 100, conditions: 100, begin: 100, input: 100, branch: 100 },
    }, model as unknown as LingbotWorld2Model);
    await session.prepare(new Blob(), "scene");
    await session.begin();
    await session.setInputEnabled(true);
    const mapping = BRANCH_ACTION_MAPPINGS[2];
    const request = { momentId: mapping.momentId, choiceId: mapping.choiceId, requestId: mapping.requestId };
    model.autoConditions = false;

    const pending = session.requestBranchAction(request, "Hands hold the pole briefly.");
    const rejection = expect(pending).rejects.toThrow("branch prompt confirmation timeout");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(runtimeEvents).toHaveBeenLastCalledWith({
      type: "command_error",
      requestId: mapping.requestId,
      message: "branch prompt confirmation timeout",
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(101);
    model.autoConditions = true;
    await session.requestBranchAction(request, "Hands hold the pole briefly.");
    expect(runtimeEvents).toHaveBeenLastCalledWith({
      type: "branch-confirmed",
      id: mapping.confirmationEventId,
      requestId: mapping.requestId,
    });
  });

  it("serializes behind an unrelated prompt update without misattributing its error", async () => {
    const model = new FakeModel();
    const runtimeEvents = vi.fn();
    const { session } = makeSession(model);
    session.attach({ onBranchRuntimeEvent: runtimeEvents });
    await session.prepare(new Blob(), "scene");
    await session.begin();
    await session.setInputEnabled(true);
    let finishUnrelated = () => {};
    (session as any).promptFlush = new Promise<void>((resolve) => { finishUnrelated = resolve; });
    const mapping = BRANCH_ACTION_MAPPINGS[3];
    const request = { momentId: mapping.momentId, choiceId: mapping.choiceId, requestId: mapping.requestId };

    const pending = session.requestBranchAction(request, "Hands clear ice briefly.");
    await Promise.resolve();
    model.emit({ type: "command_error", command: "set_prompt", reason: "unrelated update failed" });
    expect(runtimeEvents).not.toHaveBeenCalled();
    finishUnrelated();
    await pending;
    expect(runtimeEvents).toHaveBeenCalledExactlyOnceWith({
      type: "branch-confirmed",
      id: mapping.confirmationEventId,
      requestId: mapping.requestId,
    });
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

  it("reports remote session loss only after runtime readiness and before local teardown", async () => {
    const model = new FakeModel();
    const onUnexpectedDisconnect = vi.fn();
    const session = new WorldModelSession({
      mintJwt: async () => "jwt",
      onUnexpectedDisconnect,
      timeouts: { mint: 100, connect: 100, ready: 100 },
    }, model as unknown as LingbotWorld2Model);

    model.emitEvent("statusChanged", "disconnected");
    expect(onUnexpectedDisconnect).not.toHaveBeenCalled();
    await session.prepareTransport();
    model.emitEvent("statusChanged", "disconnected");
    expect(onUnexpectedDisconnect).toHaveBeenCalledOnce();

    await session.disconnect({ dispose: true });
    model.emitEvent("statusChanged", "disconnected");
    expect(onUnexpectedDisconnect).toHaveBeenCalledOnce();
  });

  it("keeps the SDK error visible when a later status only says disconnected", async () => {
    const model = new FakeModel();
    const onStatus = vi.fn();
    const onUnexpectedDisconnect = vi.fn();
    const session = new WorldModelSession({
      mintJwt: async () => "jwt",
      onStatus,
      onUnexpectedDisconnect,
      timeouts: { mint: 100, connect: 100, ready: 100 },
    }, model as unknown as LingbotWorld2Model);

    await session.prepareTransport();
    model.emitEvent("error", new Error("WebRTC handshake failed"));
    model.emitEvent("statusChanged", "disconnected");

    expect(onStatus).toHaveBeenLastCalledWith("Connection error: WebRTC handshake failed");
    expect(onUnexpectedDisconnect).toHaveBeenCalledWith("WebRTC handshake failed");
    expect(formatWorldModelError(new Error("bad eyJabc.def.ghi token")))
      .toBe("bad [redacted token] token");
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

  it("registers pagehide before minting and cancels in-flight preparation", async () => {
    let resolveMint = (_jwt: string) => {};
    const mint = new Promise<string>((resolve) => { resolveMint = resolve; });
    const addEventListener = vi.fn();
    vi.stubGlobal("window", {
      setTimeout,
      addEventListener,
      removeEventListener: vi.fn(),
    });
    const model = new FakeModel();
    const session = new WorldModelSession({
      mintJwt: () => mint,
      timeouts: { mint: 100, connect: 100, ready: 100 },
    }, model as unknown as LingbotWorld2Model);

    const preparation = session.prepareTransport();
    expect(addEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    (session as any).onPageHide();
    resolveMint("jwt");

    await expect(preparation).rejects.toThrow("stale or disposed");
    expect(session.phase).toBe("disposed");
    expect(model.calls.filter((call) => call === "disconnect")).toHaveLength(1);
  });
});

describe("presentation and rollover gates", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("recovers remote session loss once and hands fallback the current authored clock", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.runtimeFallbackStarted = false;
    player.disposed = false;
    player.rolloverDeadline = null;
    player.timers = new Set<number>();
    player.clock = 61.25;
    player.clockTimer = window.setInterval(() => {}, 250);
    player.timers.add(player.clockTimer);
    player.telemetry = vi.fn();
    player.emitLiveControls = vi.fn();
    player.opts = { onStatus: vi.fn() };
    player.cancelVideoFrames = vi.fn();
    const unbindKeys = vi.fn();
    player.unbindKeys = unbindKeys;
    player.session = { disconnect };
    player.mode = "live";
    player.startFallback = vi.fn().mockResolvedValue(undefined);

    await player.fallBackFromLive("Reactor session disconnected");
    await player.fallBackFromLive("Reactor session disconnected");

    expect(player.clockTimer).toBeNull();
    expect(unbindKeys).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(player.startFallback).toHaveBeenCalledOnce();
    expect(player.startFallback).toHaveBeenCalledWith(
      true,
      "Live connection lost: Reactor session disconnected"
    );
    expect(player.mode).toBe("fallback");
  });

  it("does not overwrite a live failure when no fallback video is shipped", async () => {
    const onStatus = vi.fn();
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.disposed = false;
    player.hasPoster = false;
    player.fallbackUsesWallClock = false;
    player.video = { srcObject: {}, style: { visibility: "visible" } };
    player.poster = { style: { display: "none" } };
    player.opts = { manifest: { assets: {} }, onStatus };
    player.presentation = { markFallbackReady: vi.fn() };

    await player.startFallback(false, "Live connection failed: WebRTC handshake failed");

    expect(onStatus).toHaveBeenLastCalledWith(
      "Live connection failed: WebRTC handshake failed"
    );
  });

  it("keeps a 503 capacity error visible while routine fallback statuses arrive", () => {
    const onStatus = vi.fn();
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.opts = { onStatus };
    player.stickyCapacityStatus = null;

    player.reportStatus("Live connection failed: token mint failed: 503 capacity exhausted");
    player.reportStatus("playing pre-rendered fallback");

    expect(onStatus).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith(
      "Live connection failed: token mint failed: 503 capacity exhausted"
    );
  });

  it("seeks a recovered recorded fallback to the current authored clock", async () => {
    vi.stubGlobal("HTMLMediaElement", { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { "content-type": "video/mp4" },
    })));
    const addEventListener = vi.fn();
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.clock = 61.25;
    player.disposed = false;
    player.hasPoster = false;
    player.fallbackUsesWallClock = false;
    player.video = {
      srcObject: {},
      style: { visibility: "hidden" },
      readyState: 2,
      currentTime: 0,
      src: "",
      loop: false,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener,
    };
    player.poster = { style: { display: "none" } };
    player.opts = {
      manifest: { assets: { fallbackVideo: "/fallback.mp4" } },
      onStatus: vi.fn(),
    };
    player.presentation = { markFallbackReady: vi.fn() };
    player.onFallbackTimeUpdate = vi.fn();

    await player.startFallback(true);

    expect(player.video.srcObject).toBeNull();
    expect(player.video.currentTime).toBe(61.25);
    expect(addEventListener).toHaveBeenCalledWith("timeupdate", expect.any(Function));
    expect(player.presentation.markFallbackReady).toHaveBeenCalledOnce();
  });

  it("maps direct mouse look and contextual action bindings", () => {
    expect(resolveWorldModelPointerLook(8, -4)).toEqual({ h: "right", v: "up" });
    expect(resolveWorldModelPointerLook(-8, 4)).toEqual({ h: "left", v: "down" });
    expect(resolveWorldModelPointerLook(0, 0)).toEqual({ h: "idle", v: "idle" });
    expect(["KeyE", "KeyF"].every(isWorldModelActionKey)).toBe(true);
    expect(["Space", "Enter"].some(isWorldModelActionKey)).toBe(false);
    expect(isWorldModelActionKey("KeyW")).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", false, false)).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", true, true)).toBe(false);
    expect(canDispatchWorldModelAction("KeyE", true, false)).toBe(true);
    expect(canDispatchWorldModelAction("KeyE", true, false, true)).toBe(false);
  });

  it("releases movement and contextual E/F edges on keyup, blur, visibility loss, and disposal", () => {
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: string; pointerLockElement: null };
    documentTarget.visibilityState = "visible";
    documentTarget.pointerLockElement = null;
    const windowTarget = new EventTarget();
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    const session = {
      setMovement: vi.fn(),
      setLook: vi.fn(),
      clearPersistentInput: vi.fn(),
    };
    const onAction = vi.fn();
    const onActionRelease = vi.fn();
    const keyboard = (type: string, code: string, repeat = false) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperties(event, {
        code: { value: code }, repeat: { value: repeat },
        ctrlKey: { value: false }, altKey: { value: false }, metaKey: { value: false },
      });
      return event;
    };
    const unbind = bindWorldModelKeys(session as unknown as WorldModelSession, () => false, {
      isPresented: () => true,
      onAction,
      onActionRelease,
    });

    documentTarget.dispatchEvent(keyboard("keydown", "KeyW"));
    documentTarget.dispatchEvent(keyboard("keyup", "KeyW"));
    expect(session.setMovement).toHaveBeenCalledWith("forward", "idle");
    expect(session.setMovement).toHaveBeenLastCalledWith("idle", "idle");
    documentTarget.dispatchEvent(keyboard("keydown", "KeyE"));
    documentTarget.dispatchEvent(keyboard("keydown", "KeyE", true));
    documentTarget.dispatchEvent(keyboard("keyup", "KeyE"));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith("E");
    expect(onActionRelease).toHaveBeenCalledWith("E");

    windowTarget.dispatchEvent(new Event("blur"));
    expect(session.clearPersistentInput).toHaveBeenCalledWith("blur");
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(session.clearPersistentInput).toHaveBeenCalledWith("visibility");
    unbind();
    expect(session.clearPersistentInput).toHaveBeenCalledWith("input-disposed");

    session.setMovement.mockClear();
    onAction.mockClear();
    const unbindCinematic = bindWorldModelKeys(session as unknown as WorldModelSession, () => false, {
      isPresented: () => true,
      navigationEnabled: () => false,
      onAction,
      onActionRelease,
    });
    documentTarget.dispatchEvent(keyboard("keydown", "KeyW"));
    documentTarget.dispatchEvent(keyboard("keydown", "KeyF"));
    documentTarget.dispatchEvent(keyboard("keyup", "KeyF"));
    expect(session.setMovement).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledExactlyOnceWith("F");
    unbindCinematic();
  });

  it("does not advertise a generic action through the director handoff", () => {
    const onControlHandoff = vi.fn();
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.opts = { onControlHandoff };

    player.emitLiveControls(true);

    expect(onControlHandoff).toHaveBeenCalledWith({
      renderer: "worldmodel",
      controlsEnabled: true,
      movement: { binding: "WASD", label: "Move" },
      look: { binding: "Mouse", label: "Look" },
    });
    expect(onControlHandoff.mock.calls[0][0]).not.toHaveProperty("action");
  });

  it("does not advertise navigation controls for Helios cinematic mode", () => {
    const onControlHandoff = vi.fn();
    const player = Object.create(WorldModelScenePlayer.prototype) as any;
    player.opts = { onControlHandoff };
    player.navigationEnabled = false;

    player.emitLiveControls(true);

    expect(onControlHandoff).toHaveBeenCalledWith({
      renderer: "worldmodel",
      controlsEnabled: false,
    });
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
