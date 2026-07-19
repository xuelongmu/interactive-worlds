import type { SignatureStroke } from "../engine/state";

export type DeclarationPhase = "assembly" | "desk" | "quill" | "drying" | "complete";
export type DeclarationAction = "approach-table" | "quill-pickup" | "sign-complete" | "quill-down";

export interface DeclarationFlowOptions {
  initialStrokes?: SignatureStroke[] | null;
  persist: (strokes: SignatureStroke[]) => void;
  emit: (action: DeclarationAction) => void;
  now?: () => number;
}

/** Pure interaction state machine used by the DOM/Three.js scene and tests. */
export class DeclarationSigningFlow {
  readonly strokes: SignatureStroke[];
  phase: DeclarationPhase = "assembly";
  private readonly options: DeclarationFlowOptions;
  private stroke: [number, number][] | null = null;
  private readonly now: () => number;
  private signCompletedAt = 0;

  constructor(options: DeclarationFlowOptions) {
    this.options = options;
    this.strokes = (options.initialStrokes ?? []).map((value) => ({
      points: value.points.map(([x, y]) => [clamp(x), clamp(y)] as [number, number]),
    }));
    this.now = options.now ?? (() => Date.now());
  }

  approachTable() {
    if (this.phase !== "assembly") return false;
    this.phase = "desk";
    this.options.emit("approach-table");
    return true;
  }

  pickupQuill() {
    if (this.phase !== "desk") return false;
    this.phase = "quill";
    this.options.emit("quill-pickup");
    return true;
  }

  beginStroke(x: number, y: number) {
    if (this.phase !== "quill") return false;
    this.stroke = [[clamp(x), clamp(y)]];
    return true;
  }

  appendStroke(x: number, y: number) {
    if (!this.stroke) return false;
    const next: [number, number] = [clamp(x), clamp(y)];
    const previous = this.stroke[this.stroke.length - 1];
    if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) > 0.002) this.stroke.push(next);
    return true;
  }

  endStroke() {
    if (!this.stroke) return false;
    const points = this.stroke;
    this.stroke = null;
    if (points.length < 2) return false;
    this.strokes.push({ points });
    this.options.persist(this.snapshot());
    return true;
  }

  completeSignature() {
    if (this.phase !== "quill" || this.strokes.length === 0) return false;
    this.phase = "drying";
    this.signCompletedAt = this.now();
    this.options.persist(this.snapshot());
    this.options.emit("sign-complete");
    return true;
  }

  /** The eight-second hold is the historical ink-drying beat. */
  canSetDown() {
    return this.phase === "quill" || (this.phase === "drying" && this.now() - this.signCompletedAt >= 8_000);
  }

  setDown() {
    if (!this.canSetDown()) return false;
    this.phase = "complete";
    this.options.emit("quill-down");
    return true;
  }

  snapshot(): SignatureStroke[] {
    return this.strokes.map((value) => ({ points: value.points.map(([x, y]) => [x, y] as [number, number]) }));
  }
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
