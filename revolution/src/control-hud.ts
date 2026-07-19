import type {
  ControlHandoffDetail as RuntimeControlHandoffDetail,
  RuntimePauseDetail,
  SceneManifest,
} from "./engine/types";
import type {
  BranchAcknowledgement,
  BranchChoiceId,
  BranchMomentId,
  BranchObjective,
  BranchPresentationAction,
  BranchPresentationActions,
  BranchRequestId,
  BranchRuntimeHandoff,
  BranchSelectionAcknowledgement,
} from "./branch-state";

export const CONTROL_STALL_DELAY_MS = 10_000;

export type ControlRenderer = RuntimeControlHandoffDetail["renderer"];
export type ControlModality = "keyboard-mouse" | "touch" | "controller";

export interface ControlBinding {
  binding: string;
  label: string;
  modality?: ControlModality;
  available?: boolean;
}

export interface ContextualActionBinding extends ControlBinding {
  /** Unusable actions are deliberately omitted from the instruction layer. */
  usable: boolean;
}

type BranchCommandErrorHandoff = Extract<
  BranchRuntimeHandoff,
  { outcome: "command_error" }
>;

export type ContextualChoiceCommandError = Readonly<
  Pick<BranchCommandErrorHandoff, "momentId" | "choiceId" | "requestId"> & {
    message: BranchCommandErrorHandoff["error"]["message"];
    visible: BranchCommandErrorHandoff["error"]["visible"];
    retryable: BranchCommandErrorHandoff["error"]["retryable"];
  }
>;

export type ContextualChoiceAcknowledgement =
  | BranchAcknowledgement
  | BranchSelectionAcknowledgement;

/** Outside-engine presentation seam. Runtime owns when a Reactor choice is
 * actually presentable; the HUD owns only rendering and keyboard arbitration. */
export interface ContextualChoiceSnapshot {
  readonly sceneId: string;
  readonly transitionKey: number;
  readonly momentId: BranchMomentId | null;
  readonly objective: BranchObjective | null;
  readonly actions: BranchPresentationActions | null;
  readonly ready: boolean;
  readonly selectedChoiceId: BranchChoiceId | null;
  readonly latchedChoiceId: BranchChoiceId | null;
  readonly acknowledgement: ContextualChoiceAcknowledgement | null;
  readonly commandError: ContextualChoiceCommandError | null;
}

/** A key edge requests one exact runtime action. It does not imply success. */
export type ContextualChoiceRequest = Readonly<
  Pick<BranchPresentationAction, "momentId" | "choiceId" | "requestId">
>;

export type ContextualChoiceResetReason =
  | "blur"
  | "visibility"
  | "reset"
  | "chapter-change"
  | "scene-switch"
  | "pause"
  | "dispose";

export interface ContextualChoiceKeyEvent {
  readonly code: string;
  readonly repeat: boolean;
  readonly target?: EventTarget | null;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  preventDefault(): void;
}

export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    closest?: (selector: string) => unknown;
  };
  const tagName = typeof candidate.tagName === "string"
    ? candidate.tagName.toUpperCase()
    : "";
  return candidate.isContentEditable === true
    || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName)
    || candidate.closest?.("[contenteditable='true']") != null;
}

function bindingForCode(code: string): "E" | "F" | null {
  if (code === "KeyE") return "E";
  if (code === "KeyF") return "F";
  return null;
}

/** Pure edge-triggered arbiter. Pending input blocks a second choice, but only
 * a runtime-confirmed latchedChoiceId is treated as completed selection. */
export class ContextualChoiceKeyArbiter {
  private snapshot: ContextualChoiceSnapshot | null = null;
  private readonly held = new Set<"E" | "F">();
  private pending: ContextualChoiceRequest | null = null;
  private readonly onRequest: (request: ContextualChoiceRequest) => void;

  constructor(onRequest: (request: ContextualChoiceRequest) => void) {
    this.onRequest = onRequest;
  }

  update(next: ContextualChoiceSnapshot): void {
    const current = this.snapshot;
    const identityChanged = current !== null && (
      current.sceneId !== next.sceneId
      || current.transitionKey !== next.transitionKey
      || current.momentId !== next.momentId
    );
    if (identityChanged || !next.ready) this.resetInput("scene-switch");
    if (
      this.pending
      && next.commandError?.requestId === this.pending.requestId
    ) {
      this.pending = null;
    }
    if (next.latchedChoiceId !== null) this.pending = null;
    this.snapshot = next;
  }

  handleKeyDown(event: ContextualChoiceKeyEvent): boolean {
    const binding = bindingForCode(event.code);
    if (
      !binding
      || event.repeat
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || isTypingTarget(event.target)
    ) return false;
    if (this.held.has(binding)) return false;
    this.held.add(binding);

    const snapshot = this.snapshot;
    if (
      !snapshot
      || !snapshot.ready
      || snapshot.momentId === null
      || snapshot.latchedChoiceId !== null
      || this.pending !== null
    ) return false;

    const action = snapshot.actions?.find((candidate) => candidate.binding === binding);
    if (
      !action
      || !action.usable
      || action.momentId !== snapshot.momentId
    ) return false;

    const request: ContextualChoiceRequest = {
      momentId: action.momentId,
      choiceId: action.choiceId,
      requestId: action.requestId,
    };
    this.pending = request;
    try {
      this.onRequest(request);
    } catch (error) {
      this.pending = null;
      throw error;
    }
    event.preventDefault();
    return true;
  }

  handleKeyUp(code: string): void {
    const binding = bindingForCode(code);
    if (binding) this.held.delete(binding);
  }

  resetInput(_reason: ContextualChoiceResetReason = "reset"): void {
    this.held.clear();
    this.pending = null;
  }
}

export interface BeatNavigationSnapshot {
  readonly sceneId: string;
  readonly transitionKey: number;
  /** False while pause/menu/other unsafe overlays own input. */
  readonly active: boolean;
  readonly nextAvailable: boolean;
  readonly previousAvailable: boolean;
  readonly feedback: BeatNavigationFeedback | null;
}

export type BeatNavigationRequest = Readonly<{
  type: "nextBeat" | "previousBeat";
  sceneId: string;
  transitionKey: number;
}>;

export type BeatNavigationResult = Readonly<
  | {
      outcome: "navigated";
      request: BeatNavigationRequest;
    }
  | {
      outcome: "clamped" | "error";
      request: BeatNavigationRequest;
      message: string;
    }
>;

export type BeatNavigationFeedback = Extract<
  BeatNavigationResult,
  { outcome: "clamped" | "error" }
>;

export interface BeatNavigationKeyEvent extends ContextualChoiceKeyEvent {
  readonly key: string;
}

function beatDirectionForEvent(
  event: Pick<BeatNavigationKeyEvent, "code" | "key">,
): BeatNavigationRequest["type"] | null {
  if (event.code === "Period") return "nextBeat";
  if (event.code === "Comma") return "previousBeat";
  if (event.key === ".") return "nextBeat";
  if (event.key === ",") return "previousBeat";
  return null;
}

/** Navigation is an edge request only; canonical beat sequencing and clamping
 * remain runtime-owned. */
export class BeatNavigationKeyArbiter {
  private snapshot: BeatNavigationSnapshot | null = null;
  private readonly held = new Set<BeatNavigationRequest["type"]>();
  private readonly onRequest: (request: BeatNavigationRequest) => void;

  constructor(onRequest: (request: BeatNavigationRequest) => void) {
    this.onRequest = onRequest;
  }

  update(next: BeatNavigationSnapshot): void {
    const current = this.snapshot;
    if (
      current
      && (
        current.sceneId !== next.sceneId
        || current.transitionKey !== next.transitionKey
      )
    ) this.resetInput("scene-switch");
    if (!next.active) this.resetInput("pause");
    this.snapshot = next;
  }

  handleKeyDown(event: BeatNavigationKeyEvent): boolean {
    const type = beatDirectionForEvent(event);
    if (
      !type
      || event.repeat
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || event.shiftKey
      || isTypingTarget(event.target)
      || this.held.has(type)
    ) return false;
    this.held.add(type);

    const snapshot = this.snapshot;
    const available = type === "nextBeat"
      ? snapshot?.nextAvailable
      : snapshot?.previousAvailable;
    if (!snapshot?.active || !available) return false;

    this.onRequest({
      type,
      sceneId: snapshot.sceneId,
      transitionKey: snapshot.transitionKey,
    });
    event.preventDefault();
    return true;
  }

  handleKeyUp(event: Pick<BeatNavigationKeyEvent, "code" | "key">): void {
    const type = beatDirectionForEvent(event);
    if (type) this.held.delete(type);
  }

  resetInput(_reason: ContextualChoiceResetReason = "reset"): void {
    this.held.clear();
  }
}

/** Typed presentation seam owned by the shell. Renderers/director lifecycle
 * code may publish this state without owning any HUD markup or copy. */
export interface ControlHandoffDetail extends Omit<
  RuntimeControlHandoffDetail,
  "movement" | "look" | "action" | "acknowledgement"
> {
  movement?: ControlBinding;
  look?: ControlBinding;
  action?: ContextualActionBinding | null;
  acknowledgement?: string | null;
  fallbacks?: ControlBinding[];
}

export type PauseStateDetail = RuntimePauseDetail;

declare global {
  interface WindowEventMap {
    "revolution:control-handoff": CustomEvent<ControlHandoffDetail>;
    "revolution:pause-state": CustomEvent<PauseStateDetail>;
  }
}

interface HudEventTarget {
  dispatchEvent(event: Event): boolean;
}

export function publishControlHandoff(
  detail: RuntimeControlHandoffDetail,
  target: HudEventTarget = window
): boolean {
  return target.dispatchEvent(new CustomEvent<ControlHandoffDetail>(
    "revolution:control-handoff",
    { detail }
  ));
}

export function publishPauseState(
  detail: RuntimePauseDetail,
  target: HudEventTarget = window
): boolean {
  return target.dispatchEvent(new CustomEvent<PauseStateDetail>(
    "revolution:pause-state",
    { detail }
  ));
}

export type InstructionReason =
  | "hidden"
  | "early"
  | "stalled"
  | "guidance"
  | "action"
  | "error";

export interface InstructionHudSnapshot {
  visible: boolean;
  reason: InstructionReason;
  bindings: ControlBinding[];
  guidance: string;
  objective: string;
  acknowledgement: string;
  error: string;
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
    transitionKey: 0,
    controlsEnabled: true,
    movement: locomotion ? { binding: "W A S D", label: "Move", modality: "keyboard-mouse" } : undefined,
    look: locomotion ? { binding: "Mouse", label: "Look", modality: "keyboard-mouse" } : undefined,
  };
}

/** Pure state model so timing and availability behavior stay testable without
 * browser globals. The DOM controller below only renders these snapshots. */
export class InstructionHudModel {
  private controls: ControlHandoffDetail | null = null;
  private choices: ContextualChoiceSnapshot | null = null;
  private beatNavigation: BeatNavigationSnapshot | null = null;
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
    if (
      this.choices
      && (
        this.choices.sceneId !== next.sceneId
        || this.choices.transitionKey !== next.transitionKey
      )
    ) this.choices = null;
    if (
      this.beatNavigation
      && (
        this.beatNavigation.sceneId !== next.sceneId
        || this.beatNavigation.transitionKey !== next.transitionKey
      )
    ) this.beatNavigation = null;
  }

  updateChoices(next: ContextualChoiceSnapshot) {
    this.choices = next;
  }

  clearChoices() {
    this.choices = null;
  }

  updateBeatNavigation(next: BeatNavigationSnapshot) {
    this.beatNavigation = next;
  }

  clearBeatNavigation() {
    this.beatNavigation = null;
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
    const beatNavigation = this.beatNavigation;
    const beatBindings: ControlBinding[] = beatNavigation?.active
      ? [
          {
            binding: ".",
            label: "Next beat",
            modality: "keyboard-mouse",
            available: beatNavigation.nextAvailable,
          },
          {
            binding: ",",
            label: "Previous beat",
            modality: "keyboard-mouse",
            available: beatNavigation.previousAvailable,
          },
        ]
      : [];
    const controlsLayerActive = !!controls?.controlsEnabled
      && controls.renderer !== "cutscene";
    if (!controls || this.paused || (!controlsLayerActive && beatBindings.length === 0)) {
      return {
        visible: false,
        reason: "hidden",
        bindings: [],
        guidance: "",
        objective: "",
        acknowledgement: "",
        error: "",
        live: "off",
      };
    }

    const choices = controlsLayerActive ? this.choices : null;
    const choiceActions = choices?.ready
      && choices.actions?.length === 2
      && choices.actions.every((action) => action.usable)
      ? choices.actions
      : null;
    const objective = choiceActions ? choices?.objective?.trim() ?? "" : "";
    const acknowledgement = choices?.acknowledgement?.trim()
      || controls.acknowledgement?.trim()
      || "";
    const error = choices?.commandError?.visible
      ? choices.commandError.message.trim()
      : beatNavigation?.feedback?.message.trim() ?? "";
    const contextualGuidance = this.guidance;
    const baseBindings = [
      ...(controlsLayerActive ? [controls.movement, controls.look, ...(controls.fallbacks ?? [])] : []),
      ...beatBindings,
    ]
      .filter((binding): binding is ControlBinding => !!binding);

    if (choiceActions) {
      return {
        visible: true,
        reason: "action",
        bindings: [...choiceActions, ...beatBindings],
        guidance: contextualGuidance,
        objective,
        acknowledgement,
        error,
        live: "polite",
      };
    }
    if (error || acknowledgement || contextualGuidance) {
      return {
        visible: true,
        reason: error ? "error" : "guidance",
        bindings: baseBindings,
        guidance: contextualGuidance,
        objective: "",
        acknowledgement,
        error,
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
        objective: "",
        acknowledgement: "",
        error: "",
        live: this.stalled ? "polite" : "off",
      };
    }
    if (beatBindings.length > 0) {
      return {
        visible: true,
        reason: "guidance",
        bindings: beatBindings,
        guidance: "",
        objective: "",
        acknowledgement: "",
        error: "",
        live: "off",
      };
    }
    return {
      visible: false,
      reason: "hidden",
      bindings: [],
      guidance: "",
      objective: "",
      acknowledgement: "",
      error: "",
      live: "off",
    };
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
      <p class="instruction-hud__objective"></p>
      <div class="instruction-hud__bindings"></div>
      <p class="instruction-hud__guidance"></p>
      <p class="instruction-hud__acknowledgement"></p>
      <p class="instruction-hud__error"></p>
      <p class="instruction-hud__announcement visually-hidden" role="status"
        aria-live="off" aria-atomic="true"></p>
    </aside>`;
}

export function controlAnnouncement(snapshot: InstructionHudSnapshot): string {
  if (!snapshot.visible || snapshot.live === "off") return "";
  const bindings = snapshot.bindings
    .map((binding) => `${binding.binding} — ${binding.label}${binding.available === false ? ", unavailable" : ""}`)
    .join(". ");
  return [
    snapshot.error ? `Action error. ${snapshot.error}` : "",
    snapshot.acknowledgement ? `Confirmation. ${snapshot.acknowledgement}` : "",
    snapshot.objective ? `Objective. ${snapshot.objective}` : "",
    snapshot.guidance ? `Instruction. ${snapshot.guidance}` : "",
    bindings
      ? `${snapshot.reason === "action" ? "Actions available" : "Controls reminder"}. ${bindings}.`
      : "",
  ].filter(Boolean).join(" ");
}

function bindingMarkup(binding: ControlBinding): HTMLElement {
  const item = document.createElement("span");
  item.className = "instruction-hud__binding";
  if (binding.modality) item.dataset.modality = binding.modality;
  if (binding.available === false) {
    item.dataset.available = "false";
    item.setAttribute("aria-disabled", "true");
  }
  const key = document.createElement("kbd");
  key.textContent = binding.binding;
  const label = document.createElement("span");
  label.textContent = binding.label;
  item.append(key, label);
  return item;
}

export interface InstructionHudController {
  update(detail: ControlHandoffDetail): void;
  updateChoices(snapshot: ContextualChoiceSnapshot): void;
  updateBeatNavigation(snapshot: BeatNavigationSnapshot): void;
  resetInput(reason?: ContextualChoiceResetReason): void;
  setPaused(paused: boolean): void;
  setGuidance(message: string): void;
  demonstrate(kind: "movement" | "look"): void;
  dispose(): void;
}

export interface InstructionHudRuntimeCallbacks {
  onContextualChoiceRequest?: (request: ContextualChoiceRequest) => void;
  onBeatNavigationRequest?: (request: BeatNavigationRequest) => void;
}

export function mountInstructionHud(
  stage: HTMLElement,
  scheduler: HudScheduler = browserScheduler,
  callbacks: InstructionHudRuntimeCallbacks = {},
): InstructionHudController {
  stage.insertAdjacentHTML("beforeend", instructionHudMarkup());
  const root = stage.querySelector<HTMLElement>(".instruction-hud")!;
  const bindings = root.querySelector<HTMLElement>(".instruction-hud__bindings")!;
  const objective = root.querySelector<HTMLElement>(".instruction-hud__objective")!;
  const guidance = root.querySelector<HTMLElement>(".instruction-hud__guidance")!;
  const acknowledgement = root.querySelector<HTMLElement>(".instruction-hud__acknowledgement")!;
  const error = root.querySelector<HTMLElement>(".instruction-hud__error")!;
  const announcement = root.querySelector<HTMLElement>(".instruction-hud__announcement")!;
  const model = new InstructionHudModel();
  const choiceArbiter = callbacks.onContextualChoiceRequest
    ? new ContextualChoiceKeyArbiter(callbacks.onContextualChoiceRequest)
    : null;
  const beatArbiter = callbacks.onBeatNavigationRequest
    ? new BeatNavigationKeyArbiter(callbacks.onBeatNavigationRequest)
    : null;
  let stallHandle: unknown = null;
  let controlIdentity = "";
  let disposed = false;

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
    objective.textContent = snapshot.objective;
    guidance.textContent = snapshot.guidance;
    acknowledgement.textContent = snapshot.acknowledgement;
    error.textContent = snapshot.error;
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
    if (disposed) return;
    beatArbiter?.handleKeyDown(event);
    choiceArbiter?.handleKeyDown(event);
    if (
      !isTypingTarget(event.target)
      && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)
    ) {
      model.demonstrate("movement");
      render();
    }
    activity();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    beatArbiter?.handleKeyUp(event);
    choiceArbiter?.handleKeyUp(event.code);
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
    const nextIdentity = `${event.detail.sceneId}:${event.detail.transitionKey}`;
    if (controlIdentity && controlIdentity !== nextIdentity) {
      choiceArbiter?.resetInput("scene-switch");
      beatArbiter?.resetInput("scene-switch");
    }
    controlIdentity = nextIdentity;
    model.transition(event.detail);
    render();
    rearmStall();
  };
  const onPause = (event: WindowEventMap["revolution:pause-state"]) => {
    if (event.detail.paused) {
      choiceArbiter?.resetInput("pause");
      beatArbiter?.resetInput("pause");
    }
    model.setPaused(event.detail.paused);
    render();
    if (event.detail.paused) clearStall();
    else rearmStall();
  };
  const resetInput = (reason: ContextualChoiceResetReason) => {
    choiceArbiter?.resetInput(reason);
    beatArbiter?.resetInput(reason);
  };
  const onBlur = () => resetInput("blur");
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") resetInput("visibility");
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  for (const event of ["pointerdown", "wheel", "touchstart"] as const) {
    document.addEventListener(event, onActivity, { passive: true });
  }
  window.addEventListener("revolution:control-handoff", onHandoff);
  window.addEventListener("revolution:pause-state", onPause);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  render();

  return {
    update: (detail) => {
      const nextIdentity = `${detail.sceneId}:${detail.transitionKey}`;
      if (controlIdentity && controlIdentity !== nextIdentity) resetInput("scene-switch");
      controlIdentity = nextIdentity;
      model.transition(detail);
      render();
      rearmStall();
    },
    updateChoices: (snapshot) => {
      choiceArbiter?.update(snapshot);
      model.updateChoices(snapshot);
      render();
    },
    updateBeatNavigation: (snapshot) => {
      beatArbiter?.update(snapshot);
      model.updateBeatNavigation(snapshot);
      render();
    },
    resetInput: (reason = "reset") => resetInput(reason),
    setPaused: (paused) => {
      if (paused) resetInput("pause");
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
      disposed = true;
      resetInput("dispose");
      clearStall();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      for (const event of ["pointerdown", "wheel", "touchstart"] as const) {
        document.removeEventListener(event, onActivity);
      }
      window.removeEventListener("revolution:control-handoff", onHandoff);
      window.removeEventListener("revolution:pause-state", onPause);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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

/** Existing beat guidance is moved into the instruction region. Neither
 * legacy guidance element remains exposed as a competing accessibility
 * layer; runtime control and pause state arrive only through DirectorOptions. */
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

  syncGuidance();

  return () => {
    guidanceObserver?.disconnect();
  };
}
