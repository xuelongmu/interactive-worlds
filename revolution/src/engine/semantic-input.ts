export type InputModality = "keyboard-mouse" | "touch";
export type SemanticInputActivity = "movement" | "look" | "action";

export interface SemanticMovementIntent {
  /** Forward is positive, backward is negative. */
  forward: number;
  /** Right is positive, left is negative. */
  strafe: number;
}

export interface SemanticLookIntent {
  /** Right is positive. Delta values are radians; rate values are normalized. */
  yaw: number;
  /** Up is positive. Delta values are radians; rate values are normalized. */
  pitch: number;
  mode: "delta" | "rate" | "idle";
}

export interface SemanticActionIntent {
  id: string;
  phase: "press" | "release";
}

export interface SemanticInputSink {
  onMovement?: (intent: Readonly<SemanticMovementIntent>) => void;
  onLook?: (intent: Readonly<SemanticLookIntent>) => void;
  onAction?: (intent: Readonly<SemanticActionIntent>) => void;
  onReset?: (reason: string) => void;
  onModalityChange?: (modality: InputModality) => void;
  onActivity?: (activity: SemanticInputActivity) => void;
}

const IDLE_MOVEMENT: Readonly<SemanticMovementIntent> = Object.freeze({ forward: 0, strafe: 0 });
const IDLE_LOOK: Readonly<SemanticLookIntent> = Object.freeze({ yaw: 0, pitch: 0, mode: "idle" });

function clampAxis(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

/**
 * Renderer-neutral retained input port. Renderers own one port and a later HUD
 * mounts `bindSemanticTouchControls()` to it; no DOM key synthesis is involved.
 */
export class SemanticInputController {
  private readonly sink: SemanticInputSink;
  private movement: Readonly<SemanticMovementIntent> = IDLE_MOVEMENT;
  private lookSources = new Set<string>();
  private actionSources = new Map<string, string>();
  private currentModality: InputModality = "keyboard-mouse";
  private resetListeners = new Set<(reason: string) => void>();
  private enabled: boolean;
  private navigationEnabled: boolean;
  private disposed = false;

  constructor(
    sink: SemanticInputSink = {},
    options: { enabled?: boolean; navigationEnabled?: boolean } = {}
  ) {
    this.sink = sink;
    this.enabled = options.enabled ?? true;
    this.navigationEnabled = options.navigationEnabled ?? true;
  }

  get modality(): InputModality { return this.currentModality; }
  get canNavigate(): boolean { return this.enabled && this.navigationEnabled && !this.disposed; }
  get supportsNavigation(): boolean { return this.navigationEnabled && !this.disposed; }
  get isEnabled(): boolean { return this.enabled && !this.disposed; }
  get movementIntent(): Readonly<SemanticMovementIntent> { return this.movement; }

  onReset(listener: (reason: string) => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  setMovement(
    source: string,
    intent: SemanticMovementIntent,
    modality: InputModality
  ): void {
    if (!this.prepare(modality) || !this.navigationEnabled) return;
    const next = Object.freeze({
      forward: clampAxis(intent.forward),
      strafe: clampAxis(intent.strafe),
    });
    if (next.forward === this.movement.forward && next.strafe === this.movement.strafe) return;
    this.movement = next;
    this.sink.onMovement?.(next);
    if (next.forward !== 0 || next.strafe !== 0) this.sink.onActivity?.("movement");
    void source;
  }

  releaseMovement(source: string, modality: InputModality): void {
    if (this.disposed || modality !== this.currentModality) return;
    void source;
    this.emitMovementIdle();
  }

  applyLookDelta(source: string, yaw: number, pitch: number, modality: InputModality): void {
    if (!this.prepare(modality) || !this.navigationEnabled) return;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || (yaw === 0 && pitch === 0)) return;
    this.lookSources.add(source);
    this.sink.onLook?.(Object.freeze({ yaw, pitch, mode: "delta" }));
    this.sink.onActivity?.("look");
  }

  setLookRate(source: string, yaw: number, pitch: number, modality: InputModality): void {
    if (!this.prepare(modality) || !this.navigationEnabled) return;
    const nextYaw = clampAxis(yaw);
    const nextPitch = clampAxis(pitch);
    if (nextYaw === 0 && nextPitch === 0) {
      this.releaseLook(source, modality);
      return;
    }
    this.lookSources.add(source);
    this.sink.onLook?.(Object.freeze({ yaw: nextYaw, pitch: nextPitch, mode: "rate" }));
    this.sink.onActivity?.("look");
  }

  releaseLook(source: string, modality: InputModality): void {
    if (this.disposed || modality !== this.currentModality || !this.lookSources.delete(source)) return;
    if (this.lookSources.size === 0) this.sink.onLook?.(IDLE_LOOK);
  }

  pressAction(
    source: string,
    actionId: string,
    modality: InputModality,
    ready = true
  ): boolean {
    if (!ready || !actionId || !this.prepare(modality) || this.actionSources.has(source)) return false;
    this.actionSources.set(source, actionId);
    this.sink.onAction?.(Object.freeze({ id: actionId, phase: "press" }));
    this.sink.onActivity?.("action");
    return true;
  }

  releaseAction(source: string, modality: InputModality): void {
    if (this.disposed || modality !== this.currentModality) return;
    const actionId = this.actionSources.get(source);
    if (!actionId) return;
    this.actionSources.delete(source);
    this.sink.onAction?.(Object.freeze({ id: actionId, phase: "release" }));
  }

  setEnabled(enabled: boolean, reason = enabled ? "input-enabled" : "input-disabled"): void {
    if (this.disposed || enabled === this.enabled) return;
    if (!enabled) this.clear(reason);
    this.enabled = enabled;
  }

  setNavigationEnabled(enabled: boolean, reason = "navigation-disabled"): void {
    if (this.disposed || enabled === this.navigationEnabled) return;
    if (!enabled) this.clear(reason);
    this.navigationEnabled = enabled;
  }

  clear(reason: string): void {
    if (this.disposed) return;
    this.emitMovementIdle();
    this.emitLookIdle();
    this.releaseAllActions();
    for (const listener of this.resetListeners) listener(reason);
    this.sink.onReset?.(reason);
  }

  dispose(reason = "input-disposed"): void {
    if (this.disposed) return;
    this.clear(reason);
    this.disposed = true;
    this.enabled = false;
    this.resetListeners.clear();
  }

  private prepare(modality: InputModality): boolean {
    if (!this.enabled || this.disposed) return false;
    if (modality !== this.currentModality) {
      this.clear("modality-switch");
      this.currentModality = modality;
      this.sink.onModalityChange?.(modality);
    }
    return true;
  }

  private emitMovementIdle(): void {
    if (this.movement.forward === 0 && this.movement.strafe === 0) return;
    this.movement = IDLE_MOVEMENT;
    this.sink.onMovement?.(IDLE_MOVEMENT);
  }

  private emitLookIdle(): void {
    if (this.lookSources.size === 0) return;
    this.lookSources.clear();
    this.sink.onLook?.(IDLE_LOOK);
  }

  private releaseAllActions(): void {
    for (const actionId of this.actionSources.values()) {
      this.sink.onAction?.(Object.freeze({ id: actionId, phase: "release" }));
    }
    this.actionSources.clear();
  }
}

export interface SemanticTouchSurface extends EventTarget {
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

export interface SemanticTouchActionBinding {
  surface: SemanticTouchSurface;
  actionId: string;
  isReady?: () => boolean;
}

export interface SemanticTouchBindingOptions {
  controller: SemanticInputController;
  movementSurface?: SemanticTouchSurface;
  lookSurface?: SemanticTouchSurface;
  actions?: readonly SemanticTouchActionBinding[];
  movementRadius?: number;
  movementDeadzone?: number;
  lookSensitivity?: number;
  lookThreshold?: number;
  maxLookDelta?: number;
  windowTarget?: EventTarget;
  documentTarget?: EventTarget & { visibilityState?: string };
}

interface PointerCoordinates extends Event {
  pointerId: number;
  pointerType?: string;
  button?: number;
  clientX: number;
  clientY: number;
}

interface ActivePointer {
  kind: "movement" | "look" | "action";
  surface: SemanticTouchSurface;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pendingX: number;
  pendingY: number;
}

/** Pointer-ID-safe DOM adapter for a future touch HUD or standalone review route. */
export function bindSemanticTouchControls(options: SemanticTouchBindingOptions): () => void {
  const {
    controller,
    movementSurface,
    lookSurface,
    actions = [],
    movementRadius = 56,
    movementDeadzone = 0.12,
    lookSensitivity = 0.0022,
    lookThreshold = 1,
    maxLookDelta = 0.12,
  } = options;
  const windowTarget = options.windowTarget ?? (typeof window === "undefined" ? undefined : window);
  const documentTarget = options.documentTarget
    ?? (typeof document === "undefined" ? undefined : document);
  const active = new Map<number, ActivePointer>();
  const occupied = new Set<"movement" | "look">();
  const listeners: Array<() => void> = [];

  const listen = (target: EventTarget | undefined, type: string, listener: EventListener) => {
    if (!target) return;
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  };
  const isTouch = (event: PointerCoordinates) =>
    (event.pointerType ?? "touch") === "touch" && (event.button ?? 0) === 0;
  const capture = (surface: SemanticTouchSurface, pointerId: number) => {
    try { surface.setPointerCapture?.(pointerId); } catch { /* detached surface */ }
  };
  const releaseCapture = (surface: SemanticTouchSurface, pointerId: number) => {
    try { surface.releasePointerCapture?.(pointerId); } catch { /* already lost */ }
  };
  const dropPointers = () => {
    for (const [pointerId, pointer] of active) releaseCapture(pointer.surface, pointerId);
    active.clear();
    occupied.clear();
  };
  const unsubscribeReset = controller.onReset(dropPointers);

  const begin = (
    kind: ActivePointer["kind"],
    surface: SemanticTouchSurface,
    event: PointerCoordinates,
    action?: SemanticTouchActionBinding
  ) => {
    if (!isTouch(event) || active.has(event.pointerId)) return;
    if (!controller.isEnabled) return;
    if ((kind === "movement" || kind === "look") && !controller.supportsNavigation) return;
    if ((kind === "movement" || kind === "look") && occupied.has(kind)) return;
    if (kind === "action"
      && !controller.pressAction(`touch:${event.pointerId}`, action!.actionId, "touch", action!.isReady?.() ?? true)) {
      return;
    }
    if (kind === "movement") {
      controller.setMovement(`touch:${event.pointerId}`, IDLE_MOVEMENT, "touch");
    } else if (kind === "look") {
      // A zero rate establishes touch modality before pointer ownership is retained.
      controller.setLookRate(`touch:${event.pointerId}`, 0, 0, "touch");
    }
    event.preventDefault();
    active.set(event.pointerId, {
      kind, surface,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      pendingX: 0, pendingY: 0,
    });
    if (kind === "movement" || kind === "look") occupied.add(kind);
    capture(surface, event.pointerId);
  };

  const move = (event: PointerCoordinates) => {
    const pointer = active.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (pointer.kind === "movement") {
      let strafe = (event.clientX - pointer.startX) / Math.max(1, movementRadius);
      let forward = (pointer.startY - event.clientY) / Math.max(1, movementRadius);
      const magnitude = Math.hypot(strafe, forward);
      if (magnitude < movementDeadzone) {
        strafe = 0;
        forward = 0;
      } else if (magnitude > 1) {
        strafe /= magnitude;
        forward /= magnitude;
      }
      controller.setMovement(`touch:${event.pointerId}`, { forward, strafe }, "touch");
      return;
    }
    if (pointer.kind === "look") {
      pointer.pendingX += event.clientX - pointer.lastX;
      pointer.pendingY += event.clientY - pointer.lastY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      if (Math.abs(pointer.pendingX) < lookThreshold && Math.abs(pointer.pendingY) < lookThreshold) return;
      const yaw = Math.max(-maxLookDelta, Math.min(maxLookDelta, pointer.pendingX * lookSensitivity));
      const pitch = Math.max(-maxLookDelta, Math.min(maxLookDelta, -pointer.pendingY * lookSensitivity));
      pointer.pendingX = 0;
      pointer.pendingY = 0;
      controller.applyLookDelta(`touch:${event.pointerId}`, yaw, pitch, "touch");
    }
  };

  const end = (event: PointerCoordinates) => {
    const pointer = active.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    active.delete(event.pointerId);
    if (pointer.kind === "movement") {
      occupied.delete("movement");
      controller.releaseMovement(`touch:${event.pointerId}`, "touch");
    } else if (pointer.kind === "look") {
      occupied.delete("look");
      controller.releaseLook(`touch:${event.pointerId}`, "touch");
    } else {
      controller.releaseAction(`touch:${event.pointerId}`, "touch");
    }
    releaseCapture(pointer.surface, event.pointerId);
  };

  if (movementSurface) {
    listen(movementSurface, "pointerdown", ((event: PointerCoordinates) => begin("movement", movementSurface, event)) as EventListener);
  }
  if (lookSurface) {
    listen(lookSurface, "pointerdown", ((event: PointerCoordinates) => begin("look", lookSurface, event)) as EventListener);
  }
  for (const action of actions) {
    listen(action.surface, "pointerdown", ((event: PointerCoordinates) => begin("action", action.surface, event, action)) as EventListener);
  }
  const moveListener = ((event: PointerCoordinates) => move(event)) as EventListener;
  const endListener = ((event: PointerCoordinates) => end(event)) as EventListener;
  for (const surface of [movementSurface, lookSurface, ...actions.map((action) => action.surface)]) {
    listen(surface, "pointermove", moveListener);
    listen(surface, "pointerup", endListener);
    listen(surface, "pointercancel", endListener);
    listen(surface, "lostpointercapture", endListener);
  }
  const reset = (reason: string) => {
    dropPointers();
    controller.clear(reason);
  };
  listen(windowTarget, "blur", (() => reset("blur")) as EventListener);
  listen(documentTarget, "visibilitychange", (() => {
    if (documentTarget?.visibilityState !== "visible") reset("visibility");
  }) as EventListener);

  return () => {
    for (const remove of listeners.splice(0)) remove();
    unsubscribeReset();
    reset("touch-adapter-disposed");
  };
}
