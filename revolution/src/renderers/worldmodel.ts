import { LingbotWorld2Model, type LingbotWorld2Message } from "@reactor-models/lingbot-world-2";
import type { EngineEvent } from "../engine/types";

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

  async disconnect() {
    for (const un of this.unsubscribes) un();
    this.unsubscribes = [];
    try { await this.model.disconnect(); } catch { /* already down */ }
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
