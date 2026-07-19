import type {
  SceneManifest,
  WorldModelPrewarmDirective,
  WorldModelPrewarmStrategy,
} from "./types";
import {
  WorldModelSession,
  fetchWorldModelReferenceImage,
  type WorldModelTelemetryEvent,
} from "../renderers/worldmodel";

export interface WorldModelPrewarmRequest {
  scene: SceneManifest;
  strategy: WorldModelPrewarmStrategy;
  ttlMs?: number;
}

interface PendingPrewarm {
  key: string;
  sceneId: string;
  strategy: WorldModelPrewarmStrategy;
  session: WorldModelSession;
  startedAt: number;
  ready: Promise<boolean>;
  expiry: ReturnType<typeof setTimeout>;
}

export interface WorldModelPrewarmControllerOptions {
  createSession?: () => WorldModelSession;
  fetchReferenceImage?: (
    url: string,
    onTelemetry?: (event: WorldModelTelemetryEvent) => void
  ) => Promise<Blob>;
  onTelemetry?: (event: WorldModelTelemetryEvent) => void;
  now?: () => number;
  defaultTtlMs?: number;
}

const DEFAULT_PREWARM_TTL_MS = 45_000;

/** Owns at most one short-lived prepared Reactor session. Preparation
 * failures are contained here so they never interrupt the active scene. */
export class WorldModelPrewarmController {
  private pending: PendingPrewarm | null = null;
  private readonly createSession: () => WorldModelSession;
  private readonly fetchReferenceImage: NonNullable<WorldModelPrewarmControllerOptions["fetchReferenceImage"]>;
  private readonly now: () => number;
  private readonly defaultTtlMs: number;

  constructor(private options: WorldModelPrewarmControllerOptions = {}) {
    this.createSession = options.createSession ?? (() => new WorldModelSession({
      onTelemetry: options.onTelemetry,
    }));
    this.fetchReferenceImage = options.fetchReferenceImage ?? fetchWorldModelReferenceImage;
    this.now = options.now ?? (() => performance.now());
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_PREWARM_TTL_MS;
  }

  get pendingKey(): string | null {
    return this.pending?.key ?? null;
  }

  async prewarm(request: WorldModelPrewarmRequest): Promise<boolean> {
    const key = this.key(request.scene.id, request.strategy);
    if (this.pending?.key === key) return this.pending.ready;
    const previous = this.pending;
    const session = this.createSession();
    const startedAt = this.now();
    const pending: PendingPrewarm = {
      key,
      sceneId: request.scene.id,
      strategy: request.strategy,
      session,
      startedAt,
      ready: Promise.resolve(false),
      expiry: setTimeout(() => {
        if (this.pending === pending) void this.cancel("ttl-expired");
      }, request.ttlMs ?? this.defaultTtlMs),
    };
    this.pending = pending;
    pending.ready = this.replaceAndPrepare(previous, pending, request);
    return pending.ready;
  }

  private async replaceAndPrepare(
    previous: PendingPrewarm | null,
    pending: PendingPrewarm,
    request: WorldModelPrewarmRequest
  ): Promise<boolean> {
    if (previous) {
      clearTimeout(previous.expiry);
      this.telemetry({ name: "prepared-session-cancelled", reason: "replaced" });
      await previous.session.disconnect({ reason: "replaced", dispose: true });
    }
    if (this.pending !== pending) {
      clearTimeout(pending.expiry);
      await pending.session.disconnect({ reason: "superseded", dispose: true });
      return false;
    }
    return this.prepare(pending, request);
  }

  /** Returns the matching prepared session, or null when preparation failed,
   * expired, was canceled, or belongs to another route/strategy. */
  async adopt(
    sceneId: string,
    strategy: WorldModelPrewarmStrategy
  ): Promise<WorldModelSession | null> {
    const pending = this.pending;
    if (!pending || pending.key !== this.key(sceneId, strategy)) return null;
    if (!(await pending.ready) || this.pending !== pending) return null;

    clearTimeout(pending.expiry);
    this.pending = null;
    pending.session.notePreparedAdoption(this.now() - pending.startedAt);
    return pending.session;
  }

  async cancelUnlessTarget(sceneId: string, reason: string): Promise<void> {
    if (this.pending?.sceneId === sceneId) return;
    await this.cancel(reason);
  }

  async cancelUnless(
    sceneId: string,
    strategy: WorldModelPrewarmStrategy,
    reason: string
  ): Promise<void> {
    if (this.pending?.key === this.key(sceneId, strategy)) return;
    await this.cancel(reason);
  }

  async cancel(reason: string): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.expiry);
    this.telemetry({ name: "prepared-session-cancelled", reason });
    await pending.session.disconnect({ reason, dispose: true });
  }

  private async prepare(
    pending: PendingPrewarm,
    request: WorldModelPrewarmRequest
  ): Promise<boolean> {
    try {
      if (request.strategy === "transport") {
        await pending.session.prepareTransport();
      } else {
        const url = request.scene.assets.referenceImage;
        if (!url) throw new Error(`scene "${request.scene.id}" has no conditioning image`);
        const image = await this.fetchReferenceImage(url, this.options.onTelemetry);
        if (this.pending !== pending) return false;
        await pending.session.prepare(image, request.scene.assets.prompt ?? "");
      }
      return this.pending === pending;
    } catch (error) {
      if (this.pending !== pending) return false;
      this.pending = null;
      clearTimeout(pending.expiry);
      this.telemetry({
        name: "prepared-session-cancelled",
        reason: `prewarm-failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      await pending.session.disconnect({ reason: "prewarm-failed", dispose: true });
      return false;
    }
  }

  private key(sceneId: string, strategy: WorldModelPrewarmStrategy): string {
    return `${sceneId}:${strategy}`;
  }

  private telemetry(event: WorldModelTelemetryEvent): void {
    this.options.onTelemetry?.(event);
  }
}

export function prewarmDirectiveAt(
  manifest: SceneManifest,
  cueId: string
): WorldModelPrewarmDirective | null {
  return manifest.livePrewarm?.find((directive) => directive.at === cueId) ?? null;
}
