import type { Cue, EngineEvent } from "./types";
import {
  PERCEIVED_TIMING_POLICY,
  finalVoiceKindForCue,
  firstVoiceKindForCue,
  requiredVoiceGapMs,
  type VoiceKind,
  type VoiceSpacingPolicy,
} from "../timing/policy";
import {
  PerceivedTimingTelemetry,
  type TimingHandoffSample,
} from "../timing/telemetry";

export interface CueEngineHooks {
  /** Called when a cue should play (VO/subtitle). Return a promise that
   *  resolves when playback ends so the queue can advance. */
  play: (cue: Cue) => Promise<void>;
  /** Immediate side-effects on trigger (lockControls). */
  action?: (cue: Cue) => void;
  /** Deferred side-effects that must wait for the line to finish
   *  (`then:` transitions, cutscenes) — the audio-first contract. */
  after?: (cue: Cue) => void | Promise<void>;
  /** Production supplies AudioEngine's pause/generation-aware wait. */
  waitForVoiceGap?: (durationMs: number) => Promise<boolean>;
  /** Emits completed runtime measurements without coupling the engine to UI. */
  onTimingSample?: (sample: TimingHandoffSample) => void;
}

export interface CueEngineOptions {
  sceneId?: string;
  voiceSpacing?: VoiceSpacingPolicy;
}

function pendingVoiceActivity(cue: Cue): TimingHandoffSample["activity"] | undefined {
  switch (cue.trigger.type) {
    case "zone-enter":
    case "dwell":
    case "action":
      return {
        kind: "player-exploration",
        reason: `waiting for ${cue.trigger.type} trigger`,
      };
    case "model-event":
      return {
        kind: "active-reactor",
        reason: "waiting for active Reactor beat completion",
      };
    default:
      return undefined;
  }
}

/** Renderer-agnostic trigger evaluation with narrator queueing.
 *  Feed it EngineEvents + update(dt); it decides what plays and when.
 *  Diegetic cues queue behind the narrator, never interrupt mid-line. */
export class CueEngine {
  private fired = new Set<string>();
  private queue: Cue[] = [];
  private playing = false;
  private stopped = false;
  private clock = 0;
  private zoneEnteredAt = new Map<string, number>();
  private completedAt = new Map<string, number>();
  private delayedEventCues = new Map<string, number>();
  private lastVoiceCompletion: { cue: Cue; kind: VoiceKind; at: number } | null = null;
  private telemetry: PerceivedTimingTelemetry;
  private sceneId: string;
  private voiceSpacing: VoiceSpacingPolicy;

  constructor(
    private cues: Cue[],
    private hooks: CueEngineHooks,
    options: CueEngineOptions = {},
  ) {
    this.sceneId = options.sceneId ?? "unknown-scene";
    this.voiceSpacing = options.voiceSpacing ?? PERCEIVED_TIMING_POLICY;
    // Cue time advances only through update(), which the Director suspends
    // while paused. Runtime measurements therefore exclude pause duration.
    this.telemetry = new PerceivedTimingTelemetry(() => this.clock * 1_000);
  }

  /** Scene teardown: no further cues fire and the pending queue is dropped
   *  (the line currently playing is allowed to finish). */
  stop() {
    this.stopped = true;
    this.queue.length = 0;
    this.delayedEventCues.clear();
    this.telemetry.cancelAll();
  }

  handleEvent(event: EngineEvent) {
    if (event.type === "zone-enter") this.zoneEnteredAt.set(event.zone, this.clock);
    if (event.type === "zone-exit") this.zoneEnteredAt.delete(event.zone);

    for (const cue of this.cues) {
      if (this.fired.has(cue.id)) continue;
      const t = cue.trigger;
      const match =
        (t.type === event.type &&
          ((event.type === "zone-enter" && t.zone === event.zone) ||
            (event.type === "action" && t.name === event.name) ||
            (event.type === "model-event" && t.name === event.name) ||
            event.type === "scene-start")) ||
        false;
      if (match) this.scheduleMatchedEvent(cue, event);
    }
  }

  /** Call each frame with elapsed seconds. Handles timer/dwell/orTimer. */
  update(dt: number) {
    this.clock += dt;
    for (const [index, cue] of this.cues.entries()) {
      if (this.fired.has(cue.id)) continue;
      const delayedUntil = this.delayedEventCues.get(cue.id);
      if (delayedUntil !== undefined && this.clock >= delayedUntil) {
        this.fire(cue);
        continue;
      }
      const t = cue.trigger;
      let shouldFire = false;
      let completedDwell = false;
      if (t.type === "timer" && t.seconds !== undefined && this.clock >= t.seconds) {
        shouldFire = true;
      } else if (t.type === "dwell" && t.zone && t.seconds !== undefined) {
        const enteredAt = this.zoneEnteredAt.get(t.zone);
        completedDwell = enteredAt !== undefined && this.clock - enteredAt >= t.seconds;
        shouldFire = completedDwell;
      }
      if (!shouldFire && t.orTimer !== undefined && this.clock >= t.orTimer) {
        shouldFire = true;
      }
      if (!shouldFire && t.orAfterPrevious !== undefined && index > 0) {
        const previousCompletedAt = this.completedAt.get(this.cues[index - 1].id);
        if (previousCompletedAt !== undefined && this.clock - previousCompletedAt >= t.orAfterPrevious) {
          shouldFire = true;
        }
      }
      if (shouldFire) {
        if (completedDwell) this.beginEventTelemetry(cue, "interaction-complete");
        this.fire(cue);
      }
    }
  }

  timingSnapshot(): TimingHandoffSample[] {
    return this.telemetry.snapshot();
  }

  /** First cue that has not been triggered yet, in authored order. */
  nextPendingCue(): Cue | undefined {
    return this.cues.find((cue) => !this.fired.has(cue.id));
  }

  /** Whether another already-triggered cue will play immediately after the
   * current line. Guidance should wait until that queue drains. */
  hasQueuedPlayback(): boolean {
    return this.queue.length > 0;
  }

  /** Development review escape hatch: trigger the next authored beat without
   * pretending its spatial/action condition occurred naturally. */
  fireNextPending(): Cue | undefined {
    const cue = this.nextPendingCue();
    if (cue) this.fire(cue);
    return cue;
  }

  /** Canonical review/navigation entry. Earlier beats are marked complete
   * without replay, then the exact target begins through the normal queue. */
  startAt(cueId: string): Cue {
    const index = this.cues.findIndex((cue) => cue.id === cueId);
    if (index < 0) throw new Error(`unknown cue "${cueId}"`);
    for (const cue of this.cues.slice(0, index)) this.fired.add(cue.id);
    const cue = this.cues[index];
    this.fire(cue);
    return cue;
  }

  private fire(cue: Cue) {
    if (this.stopped) return;
    this.delayedEventCues.delete(cue.id);
    this.fired.add(cue.id); // cues are one-shot per scene run (script cues are all `once`)
    this.hooks.action?.(cue);
    this.queue.push(cue);
    void this.drain();
  }

  private async drain() {
    if (this.playing) return;
    this.playing = true;
    while (!this.stopped && this.queue.length > 0) {
      const cue = this.queue.shift()!;
      const gapCompleted = await this.waitForRequiredVoiceGap(cue);
      if (this.stopped || !gapCompleted) break;
      this.completeTiming(`${this.sceneId}:${cue.id}:event-to-cue`, cue.subtitle ? "audible-beat" : "visible-beat");
      if (this.lastVoiceCompletion) {
        this.completeTiming(
          `${this.sceneId}:${this.lastVoiceCompletion.cue.id}:${cue.id}:voice-boundary`,
          "audible-beat",
        );
      }
      try {
        await this.hooks.play(cue);
      } catch (error) {
        console.warn(`[cues] playback failed for ${cue.id}:`, error);
      }
      // a stop() during playback wins — a dead scene must not launch the
      // old cue's `then:` transition after teardown
      if (this.stopped) break;
      this.completedAt.set(cue.id, this.clock);
      const voiceKind = finalVoiceKindForCue(cue);
      if (voiceKind) {
        this.lastVoiceCompletion = { cue, kind: voiceKind, at: this.clock };
        const nextCue = this.queue[0]
          ?? this.cues.find((candidate) => !this.fired.has(candidate.id));
        if (nextCue) {
          const activity = pendingVoiceActivity(nextCue);
          this.telemetry.begin(
            `${this.sceneId}:${cue.id}:${nextCue.id}:voice-boundary`,
            {
              sceneId: this.sceneId,
              from: "voice-complete",
              ...(activity ? { activity } : {}),
            },
          );
        }
      }
      await this.hooks.after?.(cue);
    }
    this.playing = false;
  }

  private scheduleMatchedEvent(cue: Cue, event: EngineEvent) {
    if (this.delayedEventCues.has(cue.id)) return;
    if (event.type !== "scene-start") {
      this.beginEventTelemetry(
        cue,
        event.type === "model-event" ? "reactor-beat-complete" : "interaction-complete",
      );
    }
    const delay = Math.max(0, cue.trigger.afterEventSeconds ?? 0);
    if (delay === 0) this.fire(cue);
    else this.delayedEventCues.set(cue.id, this.clock + delay);
  }

  private beginEventTelemetry(
    cue: Cue,
    from: "interaction-complete" | "reactor-beat-complete",
  ) {
    this.telemetry.begin(`${this.sceneId}:${cue.id}:event-to-cue`, {
      sceneId: this.sceneId,
      from,
    });
  }

  private async waitForRequiredVoiceGap(cue: Cue): Promise<boolean> {
    const previous = this.lastVoiceCompletion;
    const next = firstVoiceKindForCue(cue);
    if (!previous || !next) return true;
    const requiredMs = requiredVoiceGapMs({
      previous: previous.kind,
      next,
      interrupted: cue.interruption === true,
    }, this.voiceSpacing);
    const elapsedMs = Math.max(0, (this.clock - previous.at) * 1_000);
    const remainingMs = Math.max(0, requiredMs - elapsedMs);
    if (remainingMs === 0 || !this.hooks.waitForVoiceGap) return true;
    return this.hooks.waitForVoiceGap(remainingMs);
  }

  private completeTiming(
    id: string,
    to: "audible-beat" | "visible-beat",
  ) {
    const sample = this.telemetry.complete(id, to);
    if (sample) this.hooks.onTimingSample?.(sample);
  }
}
