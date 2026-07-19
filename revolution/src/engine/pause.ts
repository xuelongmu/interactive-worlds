export interface InertTarget {
  inert: boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface FocusTarget {
  disabled?: boolean;
  isConnected?: boolean;
  focus(): void;
  closest?(selector: string): unknown;
}

export class InteractionGate {
  private paused = false;
  private controlsLocked = false;

  setPaused(paused: boolean) { this.paused = paused; }
  setControlsLocked(locked: boolean) { this.controlsLocked = locked; }
  get locked() { return this.paused || this.controlsLocked; }

  dispatch(action: () => void): boolean {
    if (this.locked) return false;
    action();
    return true;
  }
}

export function setBackgroundInert(targets: InertTarget[], inert: boolean) {
  for (const target of targets) {
    target.inert = inert;
    if (inert) target.setAttribute("aria-hidden", "true");
    else target.removeAttribute("aria-hidden");
  }
}

export function trapFocus(
  container: ParentNode,
  activeElement: Element | null,
  backwards: boolean
): boolean {
  const selector = [
    "button:not(:disabled)",
    "a[href]",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) return false;

  const index = focusable.indexOf(activeElement as HTMLElement);
  const shouldWrap = index < 0 || (backwards ? index === 0 : index === focusable.length - 1);
  if (!shouldWrap) return false;
  focusable[backwards ? focusable.length - 1 : 0].focus();
  return true;
}

export function restoreFocus(target: FocusTarget | null): boolean {
  if (!target || target.disabled || target.isConnected === false) return false;
  target.focus();
  return true;
}

export function setPauseDialogView(dialog: Pick<Element, "setAttribute">, view: "menu" | "settings") {
  dialog.setAttribute("aria-labelledby", view === "settings" ? "pause-settings-title" : "pause-title");
}

export function configureLoadingSemantics(
  card: Pick<Element, "setAttribute">
) {
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-atomic", "true");
}

export async function restartPausedScene(hooks: {
  resetPauseUi: () => void;
  fadeOut: () => Promise<void>;
  teardown: () => Promise<void>;
  releasePause: () => Promise<void>;
  startScene: () => Promise<void>;
}) {
  hooks.resetPauseUi();
  await hooks.fadeOut();
  await hooks.teardown();
  await hooks.releasePause();
  await hooks.startScene();
}
