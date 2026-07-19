export const STALL_HINT_DELAY_MS = 20_000;

export interface StallTimerScheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface StallHintElement {
  textContent: string | null;
  classList: Pick<DOMTokenList, "toggle">;
  setAttribute(name: string, value: string): void;
}

/** A hidden reminder is not a live region. It becomes live only when its
 * text is revealed, preventing an announcement at scene start or on input. */
export function renderStallHint(element: StallHintElement, message: string, visible: boolean) {
  element.classList.toggle("visible", visible);
  element.setAttribute("aria-live", visible ? "polite" : "off");
  element.setAttribute("aria-hidden", visible ? "false" : "true");
  element.textContent = visible ? message : "";
}

const browserScheduler: StallTimerScheduler = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as number),
};

/** Deterministic idle lifecycle for the director's single in-scene hint.
 * Activity hides immediately and starts a fresh idle interval. */
export class StallHintTimer {
  private handle: unknown = null;
  private active = false;
  private onVisibilityChange: (visible: boolean) => void;
  private scheduler: StallTimerScheduler;
  private delayMs: number;

  constructor(
    onVisibilityChange: (visible: boolean) => void,
    scheduler: StallTimerScheduler = browserScheduler,
    delayMs = STALL_HINT_DELAY_MS
  ) {
    this.onVisibilityChange = onVisibilityChange;
    this.scheduler = scheduler;
    this.delayMs = delayMs;
  }

  start() {
    this.active = true;
    this.activity();
  }

  activity = () => {
    if (!this.active) return;
    this.onVisibilityChange(false);
    this.clear();
    this.handle = this.scheduler.set(() => {
      this.handle = null;
      if (this.active) this.onVisibilityChange(true);
    }, this.delayMs);
  };

  stop() {
    this.active = false;
    this.clear();
    this.onVisibilityChange(false);
  }

  private clear() {
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = null;
  }
}
