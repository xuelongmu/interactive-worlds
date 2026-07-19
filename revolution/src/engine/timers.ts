export interface TimerClock {
  now(): number;
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const browserClock: TimerClock = {
  now: () => performance.now(),
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as number),
};

interface TimerEntry {
  callback: () => void;
  onCancel?: () => void;
  remainingMs: number;
  startedAt: number;
  handle: unknown;
}

/** One-shot timers whose remaining duration is preserved across pause. */
export class PausableTimeouts {
  private entries = new Map<number, TimerEntry>();
  private nextId = 1;
  private paused = false;
  private clock: TimerClock;

  constructor(clock: TimerClock = browserClock) {
    this.clock = clock;
  }

  schedule(callback: () => void, delayMs: number, onCancel?: () => void): () => void {
    const id = this.nextId++;
    const entry: TimerEntry = {
      callback,
      onCancel,
      remainingMs: Math.max(0, delayMs),
      startedAt: this.clock.now(),
      handle: null,
    };
    this.entries.set(id, entry);
    if (!this.paused) this.arm(id, entry);
    return () => this.cancel(id);
  }

  wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => this.schedule(resolve, delayMs, resolve));
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    const now = this.clock.now();
    for (const entry of this.entries.values()) {
      if (entry.handle === null) continue;
      this.clock.clear(entry.handle);
      entry.handle = null;
      entry.remainingMs = Math.max(0, entry.remainingMs - (now - entry.startedAt));
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const [id, entry] of this.entries) this.arm(id, entry);
  }

  cancelAll() {
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) {
      if (entry.handle !== null) this.clock.clear(entry.handle);
      entry.onCancel?.();
    }
  }

  private arm(id: number, entry: TimerEntry) {
    entry.startedAt = this.clock.now();
    entry.handle = this.clock.set(() => {
      if (!this.entries.delete(id)) return;
      entry.handle = null;
      entry.callback();
    }, entry.remainingMs);
  }

  private cancel(id: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    if (entry.handle !== null) this.clock.clear(entry.handle);
    entry.onCancel?.();
  }
}
