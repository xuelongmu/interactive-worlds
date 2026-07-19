import type { SceneManifest } from "./engine/types";

export const CONTROL_STALL_DELAY_MS = 10_000;

export type ControlRenderer = SceneManifest["renderer"] | "cutscene";
export type ControlModality = "keyboard-mouse" | "touch" | "controller";

export interface ControlBinding {
  binding: string;
  label: string;
  modality?: ControlModality;
}

export interface ContextualActionBinding extends ControlBinding {
  /** Unusable actions are deliberately omitted from the instruction layer. */
  usable: boolean;
}

/** Typed presentation seam owned by the shell. Renderers/director lifecycle
 * code may publish this state without owning any HUD markup or copy. */
export interface ControlHandoffDetail {
  sceneId: string;
  renderer: ControlRenderer;
  transitionKey: string | number;
  controlsEnabled: boolean;
  movement?: ControlBinding;
  look?: ControlBinding;
  action?: ContextualActionBinding | null;
  fallbacks?: ControlBinding[];
}

export interface PauseStateDetail {
  paused: boolean;
  canResumePointerInput: boolean;
}

declare global {
  interface WindowEventMap {
    "revolution:control-handoff": CustomEvent<ControlHandoffDetail>;
    "revolution:pause-state": CustomEvent<PauseStateDetail>;
  }
}

export type InstructionReason = "hidden" | "early" | "stalled" | "guidance" | "action";

export interface InstructionHudSnapshot {
  visible: boolean;
  reason: InstructionReason;
  bindings: ControlBinding[];
  guidance: string;
  live: "off" | "polite";
}

export function defaultControlHandoff(
  sceneId: string,
  renderer: SceneManifest["renderer"]
): ControlHandoffDetail {
  const locomotion = renderer === "splat" || renderer === "worldmodel";
  return {
    sceneId,
    renderer,
    transitionKey: `${sceneId}:${renderer}:initial`,
    controlsEnabled: true,
    movement: locomotion ? { binding: "W A S D", label: "Move", modality: "keyboard-mouse" } : undefined,
    look: locomotion ? { binding: "Mouse", label: "Look", modality: "keyboard-mouse" } : undefined,
  };
}

/** Pure state model so timing and availability behavior stay testable without
 * browser globals. The DOM controller below only renders these snapshots. */
export class InstructionHudModel {
  private controls: ControlHandoffDetail | null = null;
  private movementDemonstrated = false;
  private lookDemonstrated = false;
  private stalled = false;
  private paused = false;
  private guidance = "";

  transition(next: ControlHandoffDetail) {
    if (this.controls?.transitionKey !== next.transitionKey) {
      this.movementDemonstrated = false;
      this.lookDemonstrated = false;
      this.stalled = false;
      this.guidance = "";
    }
    this.controls = {
      ...next,
      action: next.action?.usable ? next.action : null,
    };
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.stalled = false;
  }

  setGuidance(message: string) {
    this.guidance = message.trim();
  }

  demonstrate(kind: "movement" | "look") {
    if (this.paused || !this.controls?.controlsEnabled) return;
    if (kind === "movement") this.movementDemonstrated = true;
    else this.lookDemonstrated = true;
    this.stalled = false;
  }

  activity() {
    this.stalled = false;
  }

  stall() {
    if (!this.paused && this.controls?.controlsEnabled) this.stalled = true;
  }

  canStall(): boolean {
    return !this.paused && !!this.controls?.controlsEnabled && this.controls.renderer !== "cutscene";
  }

  snapshot(): InstructionHudSnapshot {
    const controls = this.controls;
    if (!controls || this.paused || !controls.controlsEnabled || controls.renderer === "cutscene") {
      return { visible: false, reason: "hidden", bindings: [], guidance: "", live: "off" };
    }

    const action = controls.action?.usable ? controls.action : null;
    const baseBindings = [controls.movement, controls.look, ...(controls.fallbacks ?? [])]
      .filter((binding): binding is ControlBinding => !!binding);

    if (action) {
      return {
        visible: true,
        reason: "action",
        bindings: [action],
        guidance: "",
        live: "polite",
      };
    }
    if (this.guidance) {
      return {
        visible: true,
        reason: "guidance",
        bindings: baseBindings,
        guidance: this.guidance,
        live: "polite",
      };
    }

    const movementDone = !controls.movement || this.movementDemonstrated;
    const lookDone = !controls.look || this.lookDemonstrated;
    const demonstrated = movementDone && lookDone;
    if (!demonstrated || this.stalled) {
      return {
        visible: true,
        reason: this.stalled ? "stalled" : "early",
        bindings: baseBindings,
        guidance: "",
        live: this.stalled ? "polite" : "off",
      };
    }
    return { visible: false, reason: "hidden", bindings: [], guidance: "", live: "off" };
  }
}

interface HudScheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const browserScheduler: HudScheduler = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => window.clearTimeout(handle as number),
};

export function instructionHudMarkup(): string {
  return `
    <aside class="instruction-hud" aria-label="Controls and instructions"
      data-accessibility-layer="instructions" data-visible="false">
      <p class="instruction-hud__eyebrow" aria-hidden="true">Controls</p>
      <div class="instruction-hud__bindings"></div>
      <p class="instruction-hud__guidance"></p>
      <p class="instruction-hud__announcement visually-hidden" role="status"
        aria-live="off" aria-atomic="true"></p>
    </aside>`;
}

export function controlAnnouncement(snapshot: InstructionHudSnapshot): string {
  if (!snapshot.visible || snapshot.live === "off") return "";
  if (snapshot.guidance) return `Instruction. ${snapshot.guidance}`;
  const bindings = snapshot.bindings
    .map((binding) => `${binding.binding} — ${binding.label}`)
    .join(". ");
  return bindings
    ? `${snapshot.reason === "action" ? "Action available" : "Controls reminder"}. ${bindings}.`
    : "";
}

function bindingMarkup(binding: ControlBinding): HTMLElement {
  const item = document.createElement("span");
  item.className = "instruction-hud__binding";
  if (binding.modality) item.dataset.modality = binding.modality;
  const key = document.createElement("kbd");
  key.textContent = binding.binding;
  const label = document.createElement("span");
  label.textContent = binding.label;
  item.append(key, label);
  return item;
}

export interface InstructionHudController {
  update(detail: ControlHandoffDetail): void;
  setPaused(paused: boolean): void;
  setGuidance(message: string): void;
  demonstrate(kind: "movement" | "look"): void;
  dispose(): void;
}

export function mountInstructionHud(
  stage: HTMLElement,
  scheduler: HudScheduler = browserScheduler
): InstructionHudController {
  stage.insertAdjacentHTML("beforeend", instructionHudMarkup());
  const root = stage.querySelector<HTMLElement>(".instruction-hud")!;
  const bindings = root.querySelector<HTMLElement>(".instruction-hud__bindings")!;
  const guidance = root.querySelector<HTMLElement>(".instruction-hud__guidance")!;
  const announcement = root.querySelector<HTMLElement>(".instruction-hud__announcement")!;
  const model = new InstructionHudModel();
  let stallHandle: unknown = null;

  const clearStall = () => {
    if (stallHandle !== null) scheduler.clear(stallHandle);
    stallHandle = null;
  };
  const render = () => {
    const snapshot = model.snapshot();
    root.dataset.visible = String(snapshot.visible);
    root.dataset.reason = snapshot.reason;
    root.setAttribute("aria-hidden", snapshot.visible ? "false" : "true");
    bindings.replaceChildren(...snapshot.bindings.map(bindingMarkup));
    guidance.textContent = snapshot.guidance;
    announcement.setAttribute("aria-live", snapshot.live);
    announcement.textContent = controlAnnouncement(snapshot);
  };
  const rearmStall = () => {
    clearStall();
    if (!model.canStall()) return;
    stallHandle = scheduler.set(() => {
      stallHandle = null;
      model.stall();
      render();
    }, CONTROL_STALL_DELAY_MS);
  };
  const activity = () => {
    model.activity();
    render();
    rearmStall();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      model.demonstrate("movement");
      render();
    }
    activity();
  };
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement && (event.movementX !== 0 || event.movementY !== 0)) {
      model.demonstrate("look");
      render();
    }
    activity();
  };
  const onActivity = () => activity();
  const onHandoff = (event: WindowEventMap["revolution:control-handoff"]) => {
    model.transition(event.detail);
    render();
    rearmStall();
  };
  const onPause = (event: WindowEventMap["revolution:pause-state"]) => {
    model.setPaused(event.detail.paused);
    render();
    if (event.detail.paused) clearStall();
    else rearmStall();
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("mousemove", onMouseMove);
  for (const event of ["pointerdown", "wheel", "touchstart"] as const) {
    document.addEventListener(event, onActivity, { passive: true });
  }
  window.addEventListener("revolution:control-handoff", onHandoff);
  window.addEventListener("revolution:pause-state", onPause);
  render();

  return {
    update: (detail) => {
      model.transition(detail);
      render();
      rearmStall();
    },
    setPaused: (paused) => {
      model.setPaused(paused);
      render();
      if (paused) clearStall();
      else rearmStall();
    },
    setGuidance: (message) => {
      model.setGuidance(message);
      render();
    },
    demonstrate: (kind) => {
      model.demonstrate(kind);
      render();
      rearmStall();
    },
    dispose: () => {
      clearStall();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousemove", onMouseMove);
      for (const event of ["pointerdown", "wheel", "touchstart"] as const) {
        document.removeEventListener(event, onActivity);
      }
      window.removeEventListener("revolution:control-handoff", onHandoff);
      window.removeEventListener("revolution:pause-state", onPause);
      root.remove();
    },
  };
}

export function labelSpokenContent(element: HTMLElement) {
  element.dataset.accessibilityLayer = "spoken-content";
  element.setAttribute("role", "status");
  element.setAttribute("aria-label", "Spoken narration and dialogue");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
}

/** Compatibility bridge while #37 owns the director lifecycle. Existing
 * beat guidance is moved into the instruction region, and the pause dialog's
 * visibility suppresses the HUD. Neither legacy element remains exposed as
 * a competing accessibility layer. */
export function bridgeDirectorChrome(
  stage: HTMLElement,
  controller: InstructionHudController
): () => void {
  const subtitle = stage.querySelector<HTMLElement>(".subtitle-bar");
  if (subtitle) labelSpokenContent(subtitle);

  const guidance = stage.querySelector<HTMLElement>(".beat-guidance");
  const stall = stage.querySelector<HTMLElement>(".stall-hint");
  for (const legacy of [guidance, stall]) {
    if (!legacy) continue;
    legacy.hidden = true;
    legacy.setAttribute("aria-hidden", "true");
    legacy.setAttribute("aria-live", "off");
  }

  const syncGuidance = () => {
    const visible = guidance?.classList.contains("visible") ?? false;
    controller.setGuidance(visible ? guidance?.textContent ?? "" : "");
  };
  const guidanceObserver = guidance
    ? new MutationObserver(syncGuidance)
    : null;
  guidanceObserver?.observe(guidance!, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  const pause = stage.querySelector<HTMLElement>(".pause-overlay");
  const syncPause = () => controller.setPaused(!(pause?.hidden ?? true));
  const pauseObserver = pause ? new MutationObserver(syncPause) : null;
  pauseObserver?.observe(pause!, { attributes: true, attributeFilter: ["hidden"] });
  syncGuidance();
  syncPause();

  return () => {
    guidanceObserver?.disconnect();
    pauseObserver?.disconnect();
  };
}
