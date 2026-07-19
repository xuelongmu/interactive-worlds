import type { Cue, EngineEvent } from "./types";

export interface CueEngineHooks {
  /** Called when a cue should play (VO/subtitle). Return a promise that
   *  resolves when playback ends so the queue can advance. */
  play: (cue: Cue) => Promise<void>;
  /** Immediate side-effects on trigger (lockControls). */
  action?: (cue: Cue) => void;
  /** Deferred side-effects that must wait for the line to finish
   *  (`then:` transitions, cutscenes) — the audio-first contract. */
  after?: (cue: Cue) => void;
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

  constructor(private cues: Cue[], private hooks: CueEngineHooks) {}

  /** Scene teardown: no further cues fire and the pending queue is dropped
   *  (the line currently playing is allowed to finish). */
  stop() {
    this.stopped = true;
    this.queue.length = 0;
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
      if (match) this.fire(cue);
    }
  }

  /** Call each frame with elapsed seconds. Handles timer/dwell/orTimer. */
  update(dt: number) {
    this.clock += dt;
    for (const [index, cue] of this.cues.entries()) {
      if (this.fired.has(cue.id)) continue;
      const t = cue.trigger;
      let shouldFire = false;
      if (t.type === "timer" && t.seconds !== undefined && this.clock >= t.seconds) {
        shouldFire = true;
      } else if (t.type === "dwell" && t.zone && t.seconds !== undefined) {
        const enteredAt = this.zoneEnteredAt.get(t.zone);
        shouldFire = enteredAt !== undefined && this.clock - enteredAt >= t.seconds;
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
      if (shouldFire) this.fire(cue);
    }
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

  private fire(cue: Cue) {
    if (this.stopped) return;
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
      try {
        await this.hooks.play(cue);
      } catch (error) {
        console.warn(`[cues] playback failed for ${cue.id}:`, error);
      }
      // a stop() during playback wins — a dead scene must not launch the
      // old cue's `then:` transition after teardown
      if (this.stopped) break;
      this.completedAt.set(cue.id, this.clock);
      this.hooks.after?.(cue);
    }
    this.playing = false;
  }
}
