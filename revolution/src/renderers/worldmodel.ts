import { LingbotWorld2Model, type LingbotWorld2Message } from "@reactor-models/lingbot-world-2";
import { DEFAULT_BASE_URL } from "@reactor-team/js-sdk";
import type { ControlHandoffDetail, EngineEvent, SceneManifest } from "../engine/types";
import { PausableTimeouts } from "../engine/timers";
import { resolveWorldModelInput } from "../engine/worldmodel-input";

export type WorldModelSessionPhase =
  | "idle"
  | "connecting"
  | "runtime-ready"
  | "conditioning"
  | "prepared"
  | "starting"
  | "streaming"
  | "recycling"
  | "failed"
  | "stopped"
  | "disposed";

export type WorldModelTelemetryName =
  | "token-mint"
  | "connect-to-runtime-ready"
  | "conditioning-image-fetch"
  | "conditioning-image-upload"
  | "image-accepted"
  | "conditions-ready"
  | "begin-to-generation-started"
  | "begin-to-first-frame"
  | "begin-to-first-chunk"
  | "prepared-session-adopted"
  | "prepared-session-cancelled"
  | "fallback"
  | "generation-rollover-gap";

export interface WorldModelTelemetryEvent {
  name: WorldModelTelemetryName;
  durationMs?: number;
  reason?: string;
}

export interface WorldModelSessionOptions {
  video?: HTMLVideoElement;
  /** Legacy spike convenience; production prewarming calls condition(). */
  referenceImage?: Blob;
  /** Legacy spike convenience; production prewarming calls condition(). */
  prompt?: string;
  onEvent?: (event: EngineEvent) => void;
  onMessage?: (message: LingbotWorld2Message) => void;
  onStatus?: (status: string) => void;
  /** Fires when a prepared or active runtime disconnects before local teardown. */
  onUnexpectedDisconnect?: (status: string) => void;
  onTelemetry?: (event: WorldModelTelemetryEvent) => void;
  /** Test seam; production always uses the challenge/admission broker. */
  mintJwt?: () => Promise<string>;
  timeouts?: Partial<WorldModelSessionTimeouts>;
}

interface WorldModelSessionTimeouts {
  mint: number;
  connect: number;
  ready: number;
  upload: number;
  conditions: number;
  begin: number;
}

const DEFAULT_TIMEOUTS: WorldModelSessionTimeouts = {
  mint: 15_000,
  connect: 30_000,
  ready: 30_000,
  upload: 30_000,
  conditions: 30_000,
  begin: 15_000,
};

const ALLOWED_TRANSITIONS: Record<WorldModelSessionPhase, ReadonlySet<WorldModelSessionPhase>> = {
  idle: new Set(["connecting", "failed", "stopped", "disposed"]),
  connecting: new Set(["runtime-ready", "failed", "stopped", "disposed"]),
  "runtime-ready": new Set(["conditioning", "failed", "stopped", "disposed"]),
  conditioning: new Set(["prepared", "failed", "stopped", "disposed"]),
  prepared: new Set(["starting", "failed", "stopped", "disposed"]),
  starting: new Set(["streaming", "failed", "stopped", "disposed"]),
  streaming: new Set(["recycling", "failed", "stopped", "disposed"]),
  recycling: new Set(["streaming", "failed", "stopped", "disposed"]),
  failed: new Set(["stopped", "disposed"]),
  stopped: new Set(),
  disposed: new Set(),
};

export type Longitudinal = "idle" | "forward" | "back";
export type Lateral = "idle" | "strafe_left" | "strafe_right";
export type LookH = "idle" | "left" | "right";
export type LookV = "idle" | "up" | "down";

export const ROLLOVER_OUTPUT_BUDGET_MS = 10_000;

export function resolveWorldModelPointerLook(
  movementX: number,
  movementY: number,
  deadzone = 1
): { h: LookH; v: LookV } {
  return {
    h: movementX > deadzone ? "right" : movementX < -deadzone ? "left" : "idle",
    v: movementY > deadzone ? "down" : movementY < -deadzone ? "up" : "idle",
  };
}

export function isWorldModelActionKey(code: string): boolean {
  return code === "KeyE" || code === "Space" || code === "Enter";
}

export function canDispatchWorldModelAction(
  code: string,
  presented: boolean,
  locked: boolean
): boolean {
  return isWorldModelActionKey(code) && presented && !locked;
}

export function isGroundedWorldModelEvent(name: string): boolean {
  return name === "landing" || name === "landed";
}

export function frameHasVisibleContent(
  pixels: Uint8ClampedArray,
  channelThreshold = 6,
  minimumVisibleRatio = 0.005
): boolean {
  if (pixels.length < 4) return false;
  let visible = 0;
  const pixelCount = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 0 && Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > channelThreshold) {
      visible += 1;
    }
  }
  return visible / pixelCount >= minimumVisibleRatio;
}

interface InputState {
  longitudinal: Longitudinal;
  lateral: Lateral;
  lookH: LookH;
  lookV: LookV;
}

interface PendingSignal {
  promise: Promise<void>;
  cancel(error?: Error): void;
}

/** Participant-register Reactor lifecycle. Transport preparation,
 * conditioning, and generation start are deliberately separate operations. */
export class WorldModelSession {
  private model: LingbotWorld2Model;
  private hooks: WorldModelSessionOptions;
  private lifecyclePhase: WorldModelSessionPhase = "idle";
  private operation = 0;
  private transportPromise: Promise<void> | null = null;
  private conditionPromise: Promise<void> | null = null;
  private beginPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  private permanentListenersInstalled = false;
  private unsubscribes: (() => void)[] = [];
  private pendingSignals = new Set<(error?: Error) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private jwt: string | null = null;
  private stream: MediaStream | null = null;
  private beginAt = 0;
  private rolloverAt = 0;
  private sawFirstFrame = false;
  private sawFirstChunk = false;
  private inputEnabled = false;
  private movementEnabled = true;
  private inputFlush: Promise<void> | null = null;
  private desired: InputState = {
    longitudinal: "idle",
    lateral: "idle",
    lookH: "idle",
    lookV: "idle",
  };
  private sent: InputState = { ...this.desired };
  /** Timestamp for command-to-chunk latency measurement. */
  lastCommandAt = 0;

  constructor(
    options: WorldModelSessionOptions = {},
    model: LingbotWorld2Model = new LingbotWorld2Model()
  ) {
    this.hooks = options;
    this.model = model;
  }

  get phase(): WorldModelSessionPhase {
    return this.lifecyclePhase;
  }

  static async mintJwt(): Promise<string> {
    const res = await fetch("/api/session", { method: "POST" });
    if (!res.ok) throw new Error(`token mint failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { jwt?: string };
    if (!body.jwt) throw new Error("token mint returned no jwt");
    return body.jwt;
  }

  /** Backwards-compatible cold-start convenience for the standalone spike.
   * Runtime code uses the separate public lifecycle methods instead. */
  async connect(): Promise<void> {
    if (!this.hooks.referenceImage) throw new Error("connect() requires a reference image");
    await this.prepare(this.hooks.referenceImage, this.hooks.prompt ?? "");
    await this.begin();
  }

  attach(options: Pick<
    WorldModelSessionOptions,
    "video" | "onEvent" | "onMessage" | "onStatus" | "onUnexpectedDisconnect" | "onTelemetry"
  >): void {
    this.hooks = { ...this.hooks, ...options };
    if (this.stream && options.video) this.attachStream(options.video, this.stream);
  }

  async prepareTransport(): Promise<void> {
    if (["runtime-ready", "conditioning", "prepared", "starting", "streaming", "recycling"].includes(this.phase)) {
      return;
    }
    if (this.transportPromise) return this.transportPromise;
    if (this.phase !== "idle") throw new Error(`cannot prepare transport from ${this.phase}`);

    const operation = ++this.operation;
    this.transition("connecting");
    this.installPermanentListeners();
    this.transportPromise = this.runTransportPreparation(operation);
    return this.transportPromise;
  }

  async condition(referenceImage: Blob, prompt: string): Promise<void> {
    if (this.phase === "prepared") return;
    if (this.conditionPromise) return this.conditionPromise;
    if (this.phase === "connecting") await this.prepareTransport();
    if (this.phase !== "runtime-ready") throw new Error(`cannot condition from ${this.phase}`);

    const operation = ++this.operation;
    this.transition("conditioning");
    this.conditionPromise = this.runConditioning(operation, referenceImage, prompt);
    return this.conditionPromise;
  }

  async prepare(referenceImage: Blob, prompt: string): Promise<void> {
    await this.prepareTransport();
    this.assertCurrent(this.operation);
    await this.condition(referenceImage, prompt);
  }

  /** Starts generation but does not grant control or present the stream. */
  async begin(): Promise<void> {
    if (["starting", "streaming", "recycling"].includes(this.phase)) {
      return this.beginPromise ?? Promise.resolve();
    }
    if (this.phase !== "prepared") throw new Error(`cannot begin from ${this.phase}`);
    const operation = ++this.operation;
    this.transition("starting");
    this.beginAt = performance.now();
    this.sawFirstFrame = false;
    this.sawFirstChunk = false;
    this.hooks.onStatus?.("starting generation");
    this.beginPromise = this.withTimeout(
      this.model.start(),
      this.timeout("begin"),
      "generation start timeout"
    ).then(() => this.assertCurrent(operation)).catch((error) => {
      this.fail(operation);
      throw error;
    });
    return this.beginPromise;
  }

  /** Input is retained while false and coalesced to the latest state on enable. */
  async setInputEnabled(enabled: boolean): Promise<void> {
    if (!enabled && this.inputEnabled) {
      this.desired = { longitudinal: "idle", lateral: "idle", lookH: "idle", lookV: "idle" };
      await this.flushDesiredInput();
      this.inputEnabled = false;
      return;
    }
    this.inputEnabled = enabled;
    if (enabled) await this.flushDesiredInput();
  }

  async setMovement(longitudinal: Longitudinal, lateral: Lateral): Promise<void> {
    this.desired.longitudinal = this.movementEnabled ? longitudinal : "idle";
    this.desired.lateral = this.movementEnabled ? lateral : "idle";
    await this.flushDesiredInput();
  }

  async setMovementEnabled(enabled: boolean): Promise<void> {
    this.movementEnabled = enabled;
    if (!enabled) {
      this.desired.longitudinal = "idle";
      this.desired.lateral = "idle";
    }
    await this.flushDesiredInput();
  }

  async setLook(h: LookH, v: LookV): Promise<void> {
    this.desired.lookH = h;
    this.desired.lookV = v;
    await this.flushDesiredInput();
  }

  markVideoFrame(): void {
    if (!this.beginAt || this.sawFirstFrame) return;
    this.sawFirstFrame = true;
    this.telemetry({ name: "begin-to-first-frame", durationMs: performance.now() - this.beginAt });
  }

  notePreparedAdoption(ageMs: number): void {
    this.telemetry({ name: "prepared-session-adopted", durationMs: ageMs });
  }

  /** Prompt-steer failures still emit their authored model event. */
  async steer(eventName: string, prompt: string): Promise<void> {
    try {
      await this.model.setPrompt({ prompt });
    } catch (error) {
      console.warn(`[worldmodel] steer "${eventName}" failed (cue still fires):`, error);
    } finally {
      this.hooks.onEvent?.({ type: "model-event", name: eventName });
    }
  }

  getConnectionTimings() { return this.model.getConnectionTimings(); }
  getStats() { return this.model.getStats(); }

  async captureRecording(): Promise<Blob> {
    const clip = await this.model.requestRecording();
    return this.model.downloadClipAsFile(clip, null);
  }

  async disconnect(options: { reason?: string; dispose?: boolean } = {}): Promise<void> {
    if (this.disconnectPromise) return this.disconnectPromise;
    if (this.phase === "stopped" || this.phase === "disposed") return;
    ++this.operation;
    this.inputEnabled = false;
    this.cancelPending(new Error(options.reason ?? "session disconnected"));
    this.clearTimers();
    this.removePermanentListeners();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    this.transition(options.dispose ? "disposed" : "stopped");
    this.disconnectPromise = this.model.disconnect().catch(() => undefined);
    await this.disconnectPromise;
    this.jwt = null;
    this.stream = null;
  }

  private async runTransportPreparation(operation: number): Promise<void> {
    try {
      this.hooks.onStatus?.("minting token");
      const mintAt = performance.now();
      const jwt = await this.withTimeout(
        (this.hooks.mintJwt ?? WorldModelSession.mintJwt)(),
        this.timeout("mint"),
        "token mint timeout"
      );
      this.assertCurrent(operation);
      this.jwt = jwt;
      this.telemetry({ name: "token-mint", durationMs: performance.now() - mintAt });

      this.hooks.onStatus?.("connecting");
      const connectAt = performance.now();
      await this.withTimeout(this.model.connect(jwt), this.timeout("connect"), "session connect timeout");
      this.assertCurrent(operation);
      await this.waitForReady(this.timeout("ready"));
      this.assertCurrent(operation);
      this.telemetry({
        name: "connect-to-runtime-ready",
        durationMs: performance.now() - connectAt,
      });
      this.transition("runtime-ready");
      this.hooks.onStatus?.("runtime ready");
      if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
    } catch (error) {
      if (operation !== this.operation) void this.model.disconnect().catch(() => undefined);
      this.fail(operation);
      throw error;
    }
  }

  private async runConditioning(
    operation: number,
    referenceImage: Blob,
    prompt: string
  ): Promise<void> {
    const acceptedAt = performance.now();
    const imageAccepted = this.waitForSignal<Extract<LingbotWorld2Message, { type: "image_accepted" }>>(
      (handler) => this.model.onImageAccepted(handler),
      () => true,
      this.timeout("conditions"),
      "image_accepted timeout"
    );
    const conditionsReady = this.waitForSignal<Extract<LingbotWorld2Message, { type: "conditions_ready" }>>(
      (handler) => this.model.onConditionsReady(handler),
      (message) => message.has_image && message.has_prompt,
      this.timeout("conditions"),
      "conditions_ready timeout"
    );
    const conditioningSignals = Promise.all([
      imageAccepted.promise.then(() => {
        this.assertCurrent(operation);
        this.telemetry({ name: "image-accepted", durationMs: performance.now() - acceptedAt });
      }),
      conditionsReady.promise,
    ]);
    // Observe cancellation immediately even while upload/commands are pending.
    void conditioningSignals.catch(() => undefined);

    try {
      this.hooks.onStatus?.("uploading reference image");
      const uploadAt = performance.now();
      const ref = await this.withTimeout(
        this.model.uploadFile(referenceImage, { name: "reference.jpg" }),
        this.timeout("upload"),
        "reference image upload timeout"
      );
      this.assertCurrent(operation);
      this.telemetry({
        name: "conditioning-image-upload",
        durationMs: performance.now() - uploadAt,
      });

      await this.model.setImage({ image: ref });
      this.assertCurrent(operation);
      await this.model.setPrompt({ prompt });
      this.assertCurrent(operation);
      this.hooks.onStatus?.("waiting for conditioning");

      await conditioningSignals;
      this.assertCurrent(operation);
      this.telemetry({ name: "conditions-ready", durationMs: performance.now() - acceptedAt });
      this.transition("prepared");
      this.hooks.onStatus?.("prepared");
    } catch (error) {
      this.fail(operation);
      throw error;
    } finally {
      imageAccepted.cancel();
      conditionsReady.cancel();
    }
  }

  private installPermanentListeners(): void {
    if (this.permanentListenersInstalled) return;
    this.permanentListenersInstalled = true;
    const statusHandler = (status: string) => {
      this.hooks.onStatus?.(status);
      if (
        status === "disconnected"
        && ["runtime-ready", "conditioning", "prepared", "starting", "streaming", "recycling"].includes(this.phase)
      ) {
        this.hooks.onUnexpectedDisconnect?.(status);
      }
    };
    this.model.on("statusChanged", statusHandler);
    this.unsubscribes.push(
      () => this.model.off("statusChanged", statusHandler),
      this.model.onMainVideo((_track, stream) => {
        if (this.isTerminal()) return;
        this.stream = stream;
        if (this.hooks.video) this.attachStream(this.hooks.video, stream);
      }),
      this.model.onMessage((message) => this.handleMessage(message))
    );
  }

  private removePermanentListeners(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.permanentListenersInstalled = false;
  }

  private handleMessage(message: LingbotWorld2Message): void {
    if (this.isTerminal()) return;
    if (message.type === "command_error") {
      console.warn("[worldmodel] command_error:", message.command, message.reason);
    } else if (message.type === "generation_started") {
      if (this.phase === "starting") {
        this.transition("streaming");
        this.telemetry({
          name: "begin-to-generation-started",
          durationMs: performance.now() - this.beginAt,
        });
      }
      // During rollover the model auto-starts; remain recycling until output.
    } else if (message.type === "generation_complete" && this.phase === "streaming") {
      this.rolloverAt = performance.now();
      this.transition("recycling");
    } else if (message.type === "chunk_complete") {
      if (!this.sawFirstChunk && this.beginAt) {
        this.sawFirstChunk = true;
        this.telemetry({
          name: "begin-to-first-chunk",
          durationMs: performance.now() - this.beginAt,
        });
      }
      if (this.phase === "recycling") {
        this.telemetry({
          name: "generation-rollover-gap",
          durationMs: performance.now() - this.rolloverAt,
        });
        this.transition("streaming");
      }
    }
    this.hooks.onMessage?.(message);
  }

  private async flushDesiredInput(): Promise<void> {
    if (!this.inputEnabled || this.isTerminal()) return;
    if (this.inputFlush) return this.inputFlush;
    this.inputFlush = this.runInputFlush().finally(() => {
      this.inputFlush = null;
      if (this.inputEnabled && !this.inputMatches()) void this.flushDesiredInput();
    });
    return this.inputFlush;
  }

  private async runInputFlush(): Promise<void> {
    while (this.inputEnabled && !this.isTerminal() && !this.inputMatches()) {
      const next = { ...this.desired };
      if (next.longitudinal !== this.sent.longitudinal) {
        await this.sendInput(() => this.model.setMoveLongitudinal({ move_longitudinal: next.longitudinal }));
        this.sent.longitudinal = next.longitudinal;
      }
      if (next.lateral !== this.sent.lateral) {
        await this.sendInput(() => this.model.setMoveLateral({ move_lateral: next.lateral }));
        this.sent.lateral = next.lateral;
      }
      if (next.lookH !== this.sent.lookH) {
        await this.sendInput(() => this.model.setLookHorizontal({ look_horizontal: next.lookH }));
        this.sent.lookH = next.lookH;
      }
      if (next.lookV !== this.sent.lookV) {
        await this.sendInput(() => this.model.setLookVertical({ look_vertical: next.lookV }));
        this.sent.lookV = next.lookV;
      }
    }
  }

  private async sendInput(send: () => Promise<void>): Promise<void> {
    this.lastCommandAt = performance.now();
    try {
      await send();
    } catch (error) {
      console.warn("[worldmodel] command failed:", error);
    }
  }

  private inputMatches(): boolean {
    return this.desired.longitudinal === this.sent.longitudinal
      && this.desired.lateral === this.sent.lateral
      && this.desired.lookH === this.sent.lookH
      && this.desired.lookV === this.sent.lookV;
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    if (this.model.getStatus() === "ready") return Promise.resolve();
    return this.waitForSignal<string>(
      (handler) => {
        this.model.on("statusChanged", handler);
        return () => this.model.off("statusChanged", handler);
      },
      (status) => status === "ready",
      timeoutMs,
      `session not ready after ${timeoutMs}ms (status: ${this.model.getStatus()})`
    ).promise;
  }

  private waitForSignal<T>(
    subscribe: (handler: (value: T) => void) => () => void,
    predicate: (value: T) => boolean,
    timeoutMs: number,
    message: string
  ): PendingSignal {
    let settled = false;
    let unsubscribe: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolvePromise: () => void = () => {};
    let rejectPromise: (error: Error) => void = () => {};
    const cleanup = () => {
      unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        this.timers.delete(timer);
      }
      this.pendingSignals.delete(cancel);
    };
    const cancel = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    unsubscribe = subscribe((value) => {
      if (predicate(value)) cancel();
    });
    if (!settled) {
      timer = setTimeout(() => cancel(new Error(message)), timeoutMs);
      this.timers.add(timer);
      this.pendingSignals.add(cancel);
    } else {
      unsubscribe();
    }
    return { promise, cancel };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        reject(new Error(message));
      }, timeoutMs);
      this.timers.add(timer);
      promise.then(
        (value) => {
          clearTimeout(timer);
          this.timers.delete(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          this.timers.delete(timer);
          reject(error);
        }
      );
    });
  }

  private timeout(name: keyof WorldModelSessionTimeouts): number {
    return this.hooks.timeouts?.[name] ?? DEFAULT_TIMEOUTS[name];
  }

  private transition(next: WorldModelSessionPhase): void {
    if (next === this.lifecyclePhase) return;
    if (!ALLOWED_TRANSITIONS[this.lifecyclePhase].has(next)) {
      throw new Error(`invalid world-model transition ${this.lifecyclePhase} -> ${next}`);
    }
    this.lifecyclePhase = next;
  }

  private assertCurrent(operation: number): void {
    if (operation !== this.operation || this.isTerminal()) {
      throw new Error("stale or disposed world-model operation");
    }
  }

  private fail(operation: number): void {
    if (operation === this.operation && !this.isTerminal() && this.phase !== "failed") {
      this.transition("failed");
    }
  }

  private isTerminal(): boolean {
    return this.phase === "stopped" || this.phase === "disposed";
  }

  private cancelPending(error: Error): void {
    for (const cancel of [...this.pendingSignals]) cancel(error);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private attachStream(video: HTMLVideoElement, stream: MediaStream): void {
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }

  private telemetry(event: WorldModelTelemetryEvent): void {
    this.hooks.onTelemetry?.(event);
  }

  /** Page unload cannot await SDK teardown. Send the same authenticated
   * coordinator DELETE with keepalive, then also start normal SDK cleanup. */
  private onPageHide = (): void => {
    const sessionId = this.model.getSessionId();
    if (!sessionId || !this.jwt || this.isTerminal()) return;
    const jwt = this.jwt;
    ++this.operation;
    this.cancelPending(new Error("page hidden"));
    this.removePermanentListeners();
    this.transition("disposed");
    void fetch(`${DEFAULT_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "pagehide" }),
      keepalive: true,
    }).catch(() => undefined);
    void this.model.disconnect().catch(() => undefined);
  };
}

export async function fetchWorldModelReferenceImage(
  url: string,
  onTelemetry?: (event: WorldModelTelemetryEvent) => void
): Promise<Blob> {
  const startedAt = performance.now();
  const response = await fetch(url);
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("text/html")) {
    throw new Error(`conditioning image missing: ${url}`);
  }
  const blob = await response.blob();
  onTelemetry?.({
    name: "conditioning-image-fetch",
    durationMs: performance.now() - startedAt,
  });
  return blob;
}

/** Idempotent gate shared by live and fallback presentation. */
export class WorldModelPresentationGate {
  private generationStarted = false;
  private frameDisplayed = false;
  private chunkProduced = false;
  private presented = false;
  private resolvePresented: () => void = () => {};
  readonly ready = new Promise<void>((resolve) => { this.resolvePresented = resolve; });

  constructor(private onPresent: (mode: "live" | "fallback") => void) {}

  markGenerationStarted(): void {
    this.generationStarted = true;
    this.tryLive();
  }

  markFrameDisplayed(): void {
    this.frameDisplayed = true;
    this.tryLive();
  }

  markChunkProduced(): void {
    this.chunkProduced = true;
    this.tryLive();
  }

  markFallbackReady(): void {
    this.present("fallback");
  }

  private tryLive(): void {
    if (this.generationStarted && this.frameDisplayed && this.chunkProduced) this.present("live");
  }

  private present(mode: "live" | "fallback"): void {
    if (this.presented) return;
    this.presented = true;
    this.onPresent(mode);
    this.resolvePresented();
  }
}

/** Tracks output from the automatically started World 2 successor run. */
export class WorldModelRolloverGate {
  private active = false;
  private generationStarted = false;
  private frameDisplayed = false;
  private chunkProduced = false;

  constructor(private hooks: { mask(): void; reveal(): void }) {}

  get recycling(): boolean { return this.active; }

  markGenerationComplete(): void {
    if (this.active) return;
    this.active = true;
    this.generationStarted = false;
    this.frameDisplayed = false;
    this.chunkProduced = false;
    this.hooks.mask();
  }

  markGenerationStarted(): void {
    if (!this.active) return;
    this.generationStarted = true;
  }

  markFrameDisplayed(): void {
    if (!this.active || !this.generationStarted) return;
    this.frameDisplayed = true;
    this.tryReveal();
  }

  markChunkProduced(): void {
    if (!this.active || !this.generationStarted) return;
    this.chunkProduced = true;
    this.tryReveal();
  }

  private tryReveal(): void {
    if (!this.frameDisplayed || !this.chunkProduced) return;
    this.active = false;
    this.hooks.reveal();
  }
}

/** Scripted beats stay one-shot across live runs and fallback modes. */
export class ModelEventTimeline {
  private fired = new Set<string>();
  private events: { at: number; name: string; prompt?: string }[];

  constructor(
    events: { at: number; name: string; prompt?: string }[],
    private hooks: {
      steer: (name: string, prompt: string) => void;
      emit: (name: string) => void;
    }
  ) {
    this.events = [...events].sort((a, b) => a.at - b.at);
  }

  update(clock: number): void {
    for (const event of this.events) {
      if (clock < event.at) break;
      if (this.fired.has(event.name)) continue;
      this.fired.add(event.name);
      if (event.prompt) this.hooks.steer(event.name, event.prompt);
      else this.hooks.emit(event.name);
    }
  }
}

export interface WorldModelPlayerOptions {
  container: HTMLElement;
  manifest: SceneManifest;
  onEvent: (event: EngineEvent) => void;
  onStatus?: (status: string) => void;
  onTelemetry?: (event: WorldModelTelemetryEvent) => void;
  onControlHandoff?: (
    detail: Omit<ControlHandoffDetail, "sceneId" | "transitionKey">
  ) => void;
  conditioningFrame?: Blob;
  preparedSession?: WorldModelSession;
  /** Begin-to-presented-output budget. Default 15 seconds. */
  firstFrameBudgetMs?: number;
}

/** Live -> recorded fallback -> wall-clock degradation ladder. */
export class WorldModelScenePlayer {
  readonly video: HTMLVideoElement;
  mode: "connecting" | "live" | "fallback" = "connecting";
  private poster: HTMLCanvasElement;
  private frameProbe: HTMLCanvasElement;
  private session: WorldModelSession | null = null;
  private timeline: ModelEventTimeline;
  private clock = 0;
  private timers = new Set<number>();
  private videoFrameCallbacks = new Set<number>();
  private pendingWaits = new Set<(error: Error) => void>();
  private unbindKeys: (() => void) | null = null;
  private disposed = false;
  private paused = false;
  private controlsLocked = false;
  private presented = false;
  private liveClockStarted = false;
  private clockTimer: number | null = null;
  private fallbackUsesWallClock = false;
  private hasPoster = false;
  private healthSamplePending = false;
  private blackFrameSamples = 0;
  private runtimeFallbackStarted = false;
  private rolloverDeadline: number | null = null;
  private controlTimers = new PausableTimeouts();
  private presentation = new WorldModelPresentationGate((mode) => this.onPresented(mode));
  private rollover: WorldModelRolloverGate;

  constructor(private opts: WorldModelPlayerOptions) {
    this.poster = document.createElement("canvas");
    this.poster.className = "worldmodel-poster";
    Object.assign(this.poster.style, {
      display: "none",
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    this.video = document.createElement("video");
    this.frameProbe = document.createElement("canvas");
    this.frameProbe.width = 32;
    this.frameProbe.height = 18;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.className = "worldmodel-video";
    this.video.style.visibility = "hidden";
    opts.container.append(this.poster, this.video);

    this.timeline = new ModelEventTimeline(opts.manifest.modelEvents ?? [], {
      steer: (name, prompt) => {
        this.applyModelEventControlBoundary(name);
        if (this.session) void this.session.steer(name, prompt);
        else this.opts.onEvent({ type: "model-event", name });
      },
      emit: (name) => {
        this.applyModelEventControlBoundary(name);
        this.opts.onEvent({ type: "model-event", name });
      },
    });
    this.rollover = new WorldModelRolloverGate({
      mask: () => {
        this.maskForRollover();
        void this.session?.setInputEnabled(false);
        this.emitLiveControls(false);
      },
      reveal: () => {
        this.clearRolloverDeadline();
        this.revealLiveVideo();
        void this.session?.setInputEnabled(true);
        this.emitLiveControls(true);
      },
    });
  }

  async start(): Promise<void> {
    try {
      await this.startLive();
      this.mode = "live";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn("[worldmodel] live session unavailable, falling back:", error);
      this.telemetry({ name: "fallback", reason });
      if (this.disposed) return;
      this.cancelVideoFrames();
      this.unbindKeys?.();
      this.unbindKeys = null;
      const failed = this.session;
      this.session = null;
      await failed?.disconnect({ reason, dispose: true });
      try {
        await this.startFallback();
      } catch (fallbackError) {
        if (this.disposed) return;
        throw fallbackError;
      }
      this.mode = "fallback";
    }
  }

  setControlsLocked(locked: boolean): void {
    this.controlsLocked = locked;
    if (locked && this.session) {
      void this.session.setMovement("idle", "idle");
      void this.session.setLook("idle", "idle");
    }
    if (this.presented && this.mode === "live") this.emitLiveControls(!locked && !this.paused);
  }

  canResumePointerInput(): boolean {
    return this.presented
      && this.mode === "live"
      && !this.disposed
      && !this.rollover.recycling
      && !this.runtimeFallbackStarted;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.controlTimers.pause();
      this.video.pause();
      if (document.pointerLockElement === this.video) document.exitPointerLock();
      if (this.session) {
        void this.session.setInputEnabled(false);
      }
    } else {
      this.controlTimers.resume();
      void this.video.play().catch(() => undefined);
      if (this.canResumePointerInput() && !this.controlsLocked) {
        void this.session?.setInputEnabled(true);
        void this.video.requestPointerLock();
        this.emitLiveControls(true);
      }
    }
    if (paused && this.presented && this.mode === "live") this.emitLiveControls(false);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.emitLiveControls(false);
    this.cancelPendingWaits(new Error("world-model player disposed"));
    this.cancelVideoFrames();
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
    this.unbindKeys?.();
    this.unbindKeys = null;
    this.controlTimers.cancelAll();
    this.video.pause();
    this.video.removeEventListener("timeupdate", this.onFallbackTimeUpdate);
    this.video.remove();
    this.poster.remove();
    await this.session?.disconnect({ reason: "scene-disposed", dispose: true });
    this.session = null;
  }

  private async startLive(): Promise<void> {
    const { manifest } = this.opts;
    if (!manifest.assets.referenceImage && !this.opts.conditioningFrame) {
      throw new Error("no conditioning image for live session");
    }

    const session = this.opts.preparedSession ?? new WorldModelSession({
      onTelemetry: this.opts.onTelemetry,
    });
    this.session = session;
    session.attach({
      video: this.video,
      onEvent: this.opts.onEvent,
      onStatus: this.opts.onStatus,
      onUnexpectedDisconnect: (status) => {
        if (this.presented && this.mode === "live") {
          void this.fallBackFromLive(`Reactor session ${status}`);
        }
      },
      onTelemetry: this.opts.onTelemetry,
      onMessage: (message) => this.handleModelMessage(message),
    });
    this.unbindKeys = bindWorldModelKeys(
      session,
      () => this.paused || this.controlsLocked,
      {
        target: this.video,
        isPresented: () => this.inputIsUsable(),
        onAction: () => this.opts.onEvent({ type: "action", name: "interact" }),
      }
    );

    if (session.phase === "idle") await session.prepareTransport();
    if (session.phase === "runtime-ready") {
      const referenceImage = this.opts.conditioningFrame
        ?? await fetchWorldModelReferenceImage(manifest.assets.referenceImage!, (event) => this.telemetry(event));
      if (this.disposed || this.session !== session) throw new Error("disposed during conditioning");
      await session.condition(referenceImage, manifest.assets.prompt ?? "");
    }
    if (session.phase !== "prepared") throw new Error(`session was not prepared (${session.phase})`);

    this.armUsableVideoFrame(() => {
      session.markVideoFrame();
      this.capturePoster();
      this.presentation.markFrameDisplayed();
    });
    const budget = this.opts.firstFrameBudgetMs ?? 15_000;
    await session.begin();
    await this.withDeadline(this.presentation.ready, budget, `no presented output within ${budget}ms`);
    if (this.disposed || this.session !== session) throw new Error("disposed during generation start");
  }

  private handleModelMessage(message: LingbotWorld2Message): void {
    if (this.disposed) return;
    switch (message.type) {
      case "generation_complete":
        this.rollover.markGenerationComplete();
        this.armRolloverDeadline();
        break;
      case "generation_started":
        if (this.rollover.recycling) {
          this.rollover.markGenerationStarted();
          this.armUsableVideoFrame(() => {
            this.capturePoster();
            this.rollover.markFrameDisplayed();
          });
        } else {
          this.presentation.markGenerationStarted();
        }
        break;
      case "chunk_complete":
        if (this.rollover.recycling) this.rollover.markChunkProduced();
        else {
          this.presentation.markChunkProduced();
          if (this.presented) this.monitorPresentedFrame();
        }
        break;
    }
  }

  private async startFallback(preserveLiveClock = false): Promise<void> {
    const { manifest, onStatus } = this.opts;
    this.video.srcObject = null;
    this.video.style.visibility = "hidden";
    if (this.hasPoster) this.poster.style.display = "block";
    const url = manifest.assets.fallbackVideo;
    let playable = false;
    if (url) {
      const head = await fetch(url, { method: "HEAD" }).catch(() => null);
      playable = !!head?.ok && !(head.headers.get("content-type") ?? "").includes("text/html");
    }
    if (playable && url) {
      onStatus?.("playing pre-rendered fallback");
      this.video.src = url;
      this.video.loop = false;
      const resumeAt = preserveLiveClock ? this.clock : 0;
      if (resumeAt > 0) {
        const seek = () => { this.video.currentTime = resumeAt; };
        if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
        else this.video.addEventListener("loadedmetadata", seek, { once: true });
      }
      if (!this.paused) await this.video.play().catch(() => undefined);
      await this.waitForPlayableFrame();
      this.revealLiveVideo();
      this.video.addEventListener("timeupdate", this.onFallbackTimeUpdate);
    } else {
      onStatus?.("no fallback video - running beats on a wall clock");
      this.fallbackUsesWallClock = true;
      if (preserveLiveClock) this.startWallClock();
    }
    if (this.disposed) return;
    this.presentation.markFallbackReady();
  }

  private onPresented(mode: "live" | "fallback"): void {
    if (this.presented || this.disposed) return;
    this.presented = true;
    if (mode === "live") {
      this.revealLiveVideo();
      void this.session?.setInputEnabled(true);
      this.startLiveClock();
      this.emitLiveControls(true);
    } else if (this.fallbackUsesWallClock) {
      this.startWallClock();
    }
    if (mode === "fallback") this.emitLiveControls(false);
    this.opts.onEvent({ type: "action", name: "boarded" });
    this.controlTimers.schedule(
      () => this.opts.onEvent({ type: "action", name: "control-granted" }),
      3000
    );
  }

  private startLiveClock(): void {
    if (this.liveClockStarted) return;
    this.liveClockStarted = true;
    this.clockTimer = this.every(250, () => {
      if (this.paused) return;
      this.clock += 0.25;
      this.timeline.update(this.clock);
    });
  }

  private startWallClock(): void {
    if (this.clockTimer !== null) return;
    this.clockTimer = this.every(250, () => {
      if (this.paused) return;
      this.clock += 0.25;
      this.timeline.update(this.clock);
    });
  }

  private stopSceneClock(): void {
    if (this.clockTimer === null) return;
    clearInterval(this.clockTimer);
    this.timers.delete(this.clockTimer);
    this.clockTimer = null;
  }

  private applyModelEventControlBoundary(name: string): void {
    if (isGroundedWorldModelEvent(name)) void this.session?.setMovementEnabled(false);
  }

  private emitLiveControls(enabled: boolean): void {
    this.opts.onControlHandoff?.({
      renderer: "worldmodel",
      controlsEnabled: enabled,
      movement: { binding: "WASD", label: "Move" },
      look: { binding: "Mouse / arrows", label: "Look" },
      action: { binding: "E / Space / Enter", label: "Interact", usable: enabled },
    });
  }

  private inputIsUsable(): boolean {
    return this.presented
      && this.mode === "live"
      && !this.paused
      && !this.controlsLocked
      && !this.rollover.recycling
      && !this.runtimeFallbackStarted;
  }

  private onFallbackTimeUpdate = (): void => {
    if (this.presented) this.timeline.update(this.video.currentTime);
  };

  private maskForRollover(): void {
    this.capturePoster();
    this.showPoster();
  }

  private revealLiveVideo(): void {
    this.video.style.visibility = "visible";
    this.poster.style.display = "none";
  }

  private capturePoster(): boolean {
    if (!this.video.videoWidth || !this.video.videoHeight) return false;
    const context = this.poster.getContext("2d");
    if (!context) return false;
    this.poster.width = this.video.videoWidth;
    this.poster.height = this.video.videoHeight;
    try {
      context.drawImage(this.video, 0, 0, this.poster.width, this.poster.height);
      this.hasPoster = true;
      return true;
    } catch {
      return false;
    }
  }

  private showPoster(): void {
    if (!this.hasPoster) return;
    this.poster.style.display = "block";
    this.video.style.visibility = "hidden";
  }

  private currentFrameIsUsable(): boolean {
    if (!this.video.videoWidth || !this.video.videoHeight) return false;
    const context = this.frameProbe.getContext("2d", { willReadFrequently: true });
    if (!context) return true;
    try {
      context.drawImage(this.video, 0, 0, this.frameProbe.width, this.frameProbe.height);
      return frameHasVisibleContent(
        context.getImageData(0, 0, this.frameProbe.width, this.frameProbe.height).data
      );
    } catch {
      // A browser security restriction must not turn valid output into a false fallback.
      return true;
    }
  }

  private armVideoFrame(onFrame: () => void): void {
    let callbackId = 0;
    callbackId = this.video.requestVideoFrameCallback(() => {
      this.videoFrameCallbacks.delete(callbackId);
      if (!this.disposed) onFrame();
    });
    this.videoFrameCallbacks.add(callbackId);
  }

  private armUsableVideoFrame(onFrame: () => void): void {
    this.armVideoFrame(() => {
      if (this.currentFrameIsUsable()) onFrame();
      else if (!this.disposed && this.session && !this.runtimeFallbackStarted) {
        this.armUsableVideoFrame(onFrame);
      }
    });
  }

  private monitorPresentedFrame(): void {
    if (this.healthSamplePending || this.runtimeFallbackStarted || this.rollover.recycling) return;
    this.healthSamplePending = true;
    this.armVideoFrame(() => {
      this.healthSamplePending = false;
      if (this.rollover.recycling || this.runtimeFallbackStarted) return;
      if (this.currentFrameIsUsable()) {
        this.blackFrameSamples = 0;
        this.capturePoster();
        if (!this.rollover.recycling) this.revealLiveVideo();
        return;
      }
      this.blackFrameSamples += 1;
      this.showPoster();
      if (this.blackFrameSamples >= 2) {
        void this.fallBackFromLive("persistent black Reactor output");
      }
    });
  }

  private armRolloverDeadline(): void {
    this.clearRolloverDeadline();
    this.rolloverDeadline = window.setTimeout(() => {
      this.rolloverDeadline = null;
      void this.fallBackFromLive(
        `rollover produced no usable output within ${ROLLOVER_OUTPUT_BUDGET_MS}ms`,
        ROLLOVER_OUTPUT_BUDGET_MS
      );
    }, ROLLOVER_OUTPUT_BUDGET_MS);
    this.timers.add(this.rolloverDeadline);
  }

  private clearRolloverDeadline(): void {
    if (this.rolloverDeadline === null) return;
    clearTimeout(this.rolloverDeadline);
    this.timers.delete(this.rolloverDeadline);
    this.rolloverDeadline = null;
  }

  private async fallBackFromLive(reason: string, durationMs?: number): Promise<void> {
    if (this.runtimeFallbackStarted || this.disposed) return;
    this.runtimeFallbackStarted = true;
    this.clearRolloverDeadline();
    this.stopSceneClock();
    this.telemetry({ name: "fallback", reason, durationMs });
    this.emitLiveControls(false);
    this.opts.onStatus?.("Live output unavailable - switching to recorded fallback");
    this.cancelVideoFrames();
    this.unbindKeys?.();
    this.unbindKeys = null;
    const failed = this.session;
    this.session = null;
    await failed?.disconnect({ reason, dispose: true });
    if (this.disposed) return;
    this.mode = "fallback";
    await this.startFallback(true);
  }

  private cancelVideoFrames(): void {
    for (const callback of this.videoFrameCallbacks) this.video.cancelVideoFrameCallback(callback);
    this.videoFrameCallbacks.clear();
  }

  private waitForPlayableFrame(): Promise<void> {
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      let onLoaded = () => {};
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.timers.delete(timer);
        this.video.removeEventListener("loadeddata", onLoaded);
        this.pendingWaits.delete(cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = (error: Error) => finish(error);
      const timer = window.setTimeout(() => finish(), 5_000);
      onLoaded = () => finish();
      this.timers.add(timer);
      this.pendingWaits.add(cancel);
      this.video.addEventListener("loadeddata", onLoaded, { once: true });
    });
  }

  private withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (result: { value: T } | { error: unknown }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.timers.delete(timer);
        this.pendingWaits.delete(cancel);
        if ("error" in result) reject(result.error);
        else resolve(result.value);
      };
      const cancel = (error: Error) => finish({ error });
      const timer = window.setTimeout(() => finish({ error: new Error(message) }), ms);
      this.timers.add(timer);
      this.pendingWaits.add(cancel);
      promise.then(
        (value) => finish({ value }),
        (error) => finish({ error })
      );
    });
  }

  private cancelPendingWaits(error: Error): void {
    for (const cancel of [...this.pendingWaits]) cancel(error);
    this.pendingWaits.clear();
  }

  private every(ms: number, fn: () => void): number {
    const timer = window.setInterval(fn, ms);
    this.timers.add(timer);
    return timer;
  }

  private telemetry(event: WorldModelTelemetryEvent): void {
    this.opts.onTelemetry?.(event);
  }
}

/** Keyboard -> retained world-model intent (WASD move, arrows look). */
export interface WorldModelInputBindingOptions {
  target?: HTMLElement;
  isPresented?: () => boolean;
  onAction?: () => void;
  onActivity?: (kind: "movement" | "look" | "action") => void;
}

export function bindWorldModelKeys(
  session: WorldModelSession,
  isLocked: () => boolean = () => false,
  options: WorldModelInputBindingOptions = {}
): () => void {
  const keys = new Set<string>();
  let lookIdleTimer = 0;
  const isPresented = options.isPresented ?? (() => true);
  const apply = () => {
    const { longitudinal, lateral, lookH, lookV } = resolveWorldModelInput(keys, isLocked());
    void session.setMovement(longitudinal, lateral);
    void session.setLook(lookH, lookV);
  };
  const inFormField = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  };
  const down = (event: KeyboardEvent) => {
    if (inFormField(event)) return;
    if (isWorldModelActionKey(event.code)) {
      if (canDispatchWorldModelAction(event.code, isPresented(), isLocked())) {
        event.preventDefault();
        options.onActivity?.("action");
        options.onAction?.();
      }
      return;
    }
    if (event.code.startsWith("Arrow")) event.preventDefault();
    keys.add(event.code);
    apply();
    if (isPresented() && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      options.onActivity?.("movement");
    }
  };
  const up = (event: KeyboardEvent) => {
    keys.delete(event.code);
    apply();
  };
  const pointerMove = (event: MouseEvent) => {
    if (!isPresented() || isLocked()) return;
    if (options.target && document.pointerLockElement !== options.target) return;
    const { h, v } = resolveWorldModelPointerLook(event.movementX, event.movementY);
    if (h === "idle" && v === "idle") return;
    options.onActivity?.("look");
    void session.setLook(h, v);
    clearTimeout(lookIdleTimer);
    lookIdleTimer = window.setTimeout(() => void session.setLook("idle", "idle"), 80);
  };
  const requestPointer = () => {
    if (isPresented() && !isLocked()) void options.target?.requestPointerLock();
  };
  document.addEventListener("keydown", down);
  document.addEventListener("keyup", up);
  document.addEventListener("mousemove", pointerMove);
  options.target?.addEventListener("click", requestPointer);
  return () => {
    clearTimeout(lookIdleTimer);
    document.removeEventListener("keydown", down);
    document.removeEventListener("keyup", up);
    document.removeEventListener("mousemove", pointerMove);
    options.target?.removeEventListener("click", requestPointer);
    if (options.target && document.pointerLockElement === options.target) document.exitPointerLock();
  };
}
