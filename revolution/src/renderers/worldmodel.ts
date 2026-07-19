import { LingbotWorld2Model, type LingbotWorld2Message } from "@reactor-models/lingbot-world-2";
import type { EngineEvent, SceneManifest } from "../engine/types";

export interface WorldModelOptions {
  video: HTMLVideoElement;
  /** conditioning image (required by the model before start) */
  referenceImage: Blob;
  prompt: string;
  onEvent?: (event: EngineEvent) => void;
  onMessage?: (message: LingbotWorld2Message) => void;
  onStatus?: (status: string) => void;
}

export type Longitudinal = "idle" | "forward" | "back";
export type Lateral = "idle" | "strafe_left" | "strafe_right";
export type LookH = "idle" | "left" | "right";
export type LookV = "idle" | "up" | "down";

/** Participant-register renderer: a live Lingbot World 2 session.
 *  Auth: short-lived JWT minted by /api/session (the token broker); the
 *  Reactor API key never reaches the client. Input state is edge-triggered —
 *  commands are only sent when a value changes, since they apply per chunk. */
export class WorldModelSession {
  private model: LingbotWorld2Model;
  private current = {
    longitudinal: "idle" as Longitudinal,
    lateral: "idle" as Lateral,
    lookH: "idle" as LookH,
    lookV: "idle" as LookV,
  };
  private unsubscribes: (() => void)[] = [];
  /** Serializes input commands so a stale movement/look update can never
   *  resolve after (and override) a newer one. */
  private commandChain: Promise<void> = Promise.resolve();
  /** timestamps for command->chunk latency measurement (spike HUD) */
  lastCommandAt = 0;

  private enqueue(send: () => Promise<void>): Promise<void> {
    this.commandChain = this.commandChain
      .then(send)
      .catch((error) => console.warn("[worldmodel] command failed:", error));
    return this.commandChain;
  }

  constructor(private opts: WorldModelOptions) {
    this.model = new LingbotWorld2Model();
  }

  static async mintJwt(): Promise<string> {
    const res = await fetch("/api/session", { method: "POST" });
    if (!res.ok) throw new Error(`token mint failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { jwt?: string };
    if (!body.jwt) throw new Error("token mint returned no jwt");
    return body.jwt;
  }

  async connect(): Promise<void> {
    const { video, onMessage, onStatus } = this.opts;
    this.unsubscribes.push(
      this.model.onMainVideo((_track, stream) => {
        video.srcObject = stream;
        void video.play();
      }),
      this.model.onMessage((message) => {
        onMessage?.(message);
        if (message.type === "command_error") {
          console.warn("[worldmodel] command_error:", message.command, message.reason);
        }
      })
    );
    this.model.on("statusChanged", (status: string) => onStatus?.(status));

    onStatus?.("minting token");
    const jwt = await WorldModelSession.mintJwt();
    onStatus?.("connecting");
    await this.model.connect(jwt);

    // connect() can resolve while the session is still "waiting"; commands
    // and uploads are only legal once the runtime reports "ready".
    await this.waitForReady(30_000);

    onStatus?.("uploading reference image");
    const ref = await this.model.uploadFile(this.opts.referenceImage, { name: "reference.jpg" });

    // set_image decodes server-side; start() is only legal once the model
    // confirms both conditions. Arm the listener before sending.
    const conditionsMet = new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(
        () => { unsubscribe(); rejectReady(new Error("conditions_ready timeout (30s)")); },
        30_000
      );
      const unsubscribe = this.model.onConditionsReady((message) => {
        if (message.has_image && message.has_prompt) {
          clearTimeout(timeout);
          unsubscribe();
          resolveReady();
        }
      });
    });
    await this.model.setImage({ image: ref });
    await this.model.setPrompt({ prompt: this.opts.prompt });
    onStatus?.("waiting for conditioning");
    await conditionsMet;
    onStatus?.("starting generation");
    await this.model.start();
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    if (this.model.getStatus() === "ready") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.model.off("statusChanged", handler);
        reject(new Error(`session not ready after ${timeoutMs}ms (status: ${this.model.getStatus()})`));
      }, timeoutMs);
      const handler = (status: string) => {
        if (status === "ready") {
          clearTimeout(timeout);
          this.model.off("statusChanged", handler);
          resolve();
        }
      };
      this.model.on("statusChanged", handler);
    });
  }

  /** Hot-swap the prompt to steer the next chunk — the mechanism behind
   *  scripted beats (storm intensifies, landing). Also emits a model-event
   *  so the cue engine can react. */
  async steer(eventName: string, prompt: string) {
    await this.model.setPrompt({ prompt });
    this.opts.onEvent?.({ type: "model-event", name: eventName });
  }

  async setMovement(longitudinal: Longitudinal, lateral: Lateral) {
    if (longitudinal !== this.current.longitudinal) {
      this.current.longitudinal = longitudinal;
      this.lastCommandAt = performance.now();
      await this.enqueue(() => this.model.setMoveLongitudinal({ move_longitudinal: longitudinal }));
    }
    if (lateral !== this.current.lateral) {
      this.current.lateral = lateral;
      this.lastCommandAt = performance.now();
      await this.enqueue(() => this.model.setMoveLateral({ move_lateral: lateral }));
    }
  }

  async setLook(h: LookH, v: LookV) {
    if (h !== this.current.lookH) {
      this.current.lookH = h;
      this.lastCommandAt = performance.now();
      await this.enqueue(() => this.model.setLookHorizontal({ look_horizontal: h }));
    }
    if (v !== this.current.lookV) {
      this.current.lookV = v;
      this.lastCommandAt = performance.now();
      await this.enqueue(() => this.model.setLookVertical({ look_vertical: v }));
    }
  }

  getConnectionTimings() { return this.model.getConnectionTimings(); }
  getStats() { return this.model.getStats(); }

  /** Capture the session so far as a downloadable file (the fallback-video
   *  source). `requestRecording()` returns an HLS playlist; the SDK streams
   *  its chunks into a single Blob. Save a good run as
   *  public/assets/video/<scene>.mp4. */
  async captureRecording(): Promise<Blob> {
    const clip = await this.model.requestRecording();
    return this.model.downloadClipAsFile(clip, null);
  }

  async disconnect() {
    for (const un of this.unsubscribes) un();
    this.unsubscribes = [];
    try { await this.model.disconnect(); } catch { /* already down */ }
  }
}

/** Scripted-beat timeline: fires each manifest `modelEvents` entry once when
 *  the scene clock reaches its `at`. Beats with a prompt steer the model
 *  (which emits the model-event); prompt-less beats are cue-only emits.
 *  The same timeline runs against a live session clock or a fallback video's
 *  currentTime — same beats, same narration, either way. */
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

  /** Advance to the absolute scene clock (seconds). Idempotent per beat. */
  update(clock: number) {
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
  /** continuity trick: a captured frame from the previous surface replaces
   *  the manifest's baked conditioning image */
  conditioningFrame?: Blob;
  /** live-path budget: connect through first frame (ms). Default 15000. */
  firstFrameBudgetMs?: number;
}

/** Participant-register scene runner with the degraded-never-broken ladder:
 *  1. live Reactor session — beats steer the model on the scene clock
 *  2. pre-rendered fallback mp4 — beats fire off video.currentTime
 *  3. no assets at all (dev) — black frame, beats fire off a wall clock
 *  The narration timeline is identical in all three. The session is always
 *  disconnected on dispose — GPU sessions bill by the minute. */
export class WorldModelScenePlayer {
  readonly video: HTMLVideoElement;
  mode: "connecting" | "live" | "fallback" = "connecting";
  private session: WorldModelSession | null = null;
  private timeline: ModelEventTimeline;
  private clock = 0;
  private timers: number[] = [];
  private unbindKeys: (() => void) | null = null;
  private disposed = false;
  private onBeforeUnload = () => void this.session?.disconnect();

  constructor(private opts: WorldModelPlayerOptions) {
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.className = "worldmodel-video";
    opts.container.appendChild(this.video);

    this.timeline = new ModelEventTimeline(opts.manifest.modelEvents ?? [], {
      steer: (name, prompt) => {
        if (this.session) void this.session.steer(name, prompt);
        else this.opts.onEvent({ type: "model-event", name });
      },
      emit: (name) => this.opts.onEvent({ type: "model-event", name }),
    });
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  /** Resolves once frames are flowing (live) or the fallback is playing. */
  async start(): Promise<void> {
    try {
      await this.startLive();
      this.mode = "live";
    } catch (error) {
      console.warn(`[worldmodel] live session unavailable, falling back:`, error);
      if (this.disposed) return;
      await this.session?.disconnect();
      this.session = null;
      await this.startFallback();
      this.mode = "fallback";
    }
  }

  private async startLive(): Promise<void> {
    const { manifest, onStatus } = this.opts;
    if (!manifest.assets.referenceImage && !this.opts.conditioningFrame) {
      throw new Error("no conditioning image for live session");
    }
    let referenceImage = this.opts.conditioningFrame;
    if (!referenceImage) {
      const res = await fetch(manifest.assets.referenceImage!);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.includes("text/html")) {
        throw new Error(`conditioning image missing: ${manifest.assets.referenceImage}`);
      }
      referenceImage = await res.blob();
    }

    const budget = this.opts.firstFrameBudgetMs ?? 15_000;
    const firstFrame = new Promise<void>((resolve) => {
      this.video.requestVideoFrameCallback(() => resolve());
    });
    let generationStarted = false;

    this.session = new WorldModelSession({
      video: this.video,
      referenceImage,
      prompt: manifest.assets.prompt ?? "",
      onEvent: this.opts.onEvent,
      onStatus,
      onMessage: (message) => {
        if (message.type === "generation_started" && !generationStarted) {
          generationStarted = true;
          this.onControlHandoff();
        }
      },
    });

    await this.withDeadline(
      this.session.connect().then(() => firstFrame),
      budget,
      `no first frame within ${budget}ms`
    );
    if (this.disposed) throw new Error("disposed during connect");
    this.unbindKeys = bindWorldModelKeys(this.session);
    // live scene clock: the beats are authored in seconds from control handoff
    this.every(250, () => {
      this.clock += 0.25;
      this.timeline.update(this.clock);
    });
  }

  private async startFallback(): Promise<void> {
    const { manifest, onStatus } = this.opts;
    // a partial live connect may have bound its MediaStream to the element;
    // it would shadow src and the fallback would never advance
    this.video.srcObject = null;
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
      // beats keyed to the recording's own clock survive stalls and seeks
      this.video.addEventListener("timeupdate", () =>
        this.timeline.update(this.video.currentTime)
      );
      await this.video.play().catch(() => { /* autoplay policy; poster frame is fine */ });
    } else {
      // dev path: nothing generated yet — hold black and run beats on a clock
      onStatus?.("no fallback video — running beats on a wall clock");
      this.every(250, () => {
        this.clock += 0.25;
        this.timeline.update(this.clock);
      });
    }
    this.onControlHandoff();
  }

  /** Common entry beat: the viewer is aboard; control (live only) follows. */
  private onControlHandoff() {
    this.opts.onEvent({ type: "action", name: "boarded" });
    this.after(3000, () => this.opts.onEvent({ type: "action", name: "control-granted" }));
  }

  private withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), ms);
      this.timers.push(timer);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
  }

  private every(ms: number, fn: () => void) {
    this.timers.push(window.setInterval(fn, ms));
  }
  private after(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** Always called on scene exit — the session must never outlive the scene. */
  async dispose() {
    this.disposed = true;
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    for (const t of this.timers) { clearTimeout(t); clearInterval(t); }
    this.timers = [];
    this.unbindKeys?.();
    this.unbindKeys = null;
    this.video.pause();
    this.video.remove();
    await this.session?.disconnect();
    this.session = null;
  }
}

/** Keyboard -> world-model input mapping (WASD move, arrows look). */
export function bindWorldModelKeys(session: WorldModelSession): () => void {
  const keys = new Set<string>();
  const apply = () => {
    const longitudinal: Longitudinal =
      keys.has("KeyW") ? "forward" : keys.has("KeyS") ? "back" : "idle";
    const lateral: Lateral =
      keys.has("KeyA") ? "strafe_left" : keys.has("KeyD") ? "strafe_right" : "idle";
    const lookH: LookH =
      keys.has("ArrowLeft") ? "left" : keys.has("ArrowRight") ? "right" : "idle";
    const lookV: LookV =
      keys.has("ArrowUp") ? "up" : keys.has("ArrowDown") ? "down" : "idle";
    void session.setMovement(longitudinal, lateral);
    void session.setLook(lookH, lookV);
  };
  const inFormField = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  };
  const down = (e: KeyboardEvent) => {
    if (inFormField(e)) return;
    if (e.code.startsWith("Arrow")) e.preventDefault();
    keys.add(e.code); apply();
  };
  // keyup always clears — a key pressed on the document but released inside
  // a form field must not stay "held" and keep the model moving.
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code); apply();
  };
  document.addEventListener("keydown", down);
  document.addEventListener("keyup", up);
  return () => {
    document.removeEventListener("keydown", down);
    document.removeEventListener("keyup", up);
  };
}
