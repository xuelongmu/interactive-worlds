import type { SignatureStroke } from "../engine/state";

export interface TimedSignatureStroke extends SignatureStroke {
  /** Epoch milliseconds when the stroke was released. */
  completedAt: number;
}

export interface SignatureRenderOptions {
  /** Draw into this normalized rectangle; defaults to the full canvas. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  lineWidth?: number;
}

function point(stroke: SignatureStroke, index: number): [number, number] | undefined {
  const value = stroke.points[index];
  if (!value || value.length !== 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) return undefined;
  return [Math.min(1, Math.max(0, value[0])), Math.min(1, Math.max(0, value[1]))];
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: SignatureStroke,
  options: Required<SignatureRenderOptions>,
  jitter = 0,
) {
  const first = point(stroke, 0);
  if (!first) return;
  const px = (x: number) => (options.x + x * options.width) * ctx.canvas.width;
  const py = (y: number) => (options.y + y * options.height) * ctx.canvas.height;
  ctx.beginPath();
  ctx.moveTo(px(first[0]), py(first[1]));
  for (let i = 1; i < stroke.points.length; i++) {
    const next = point(stroke, i);
    if (!next) continue;
    // A deterministic, very small feathering offset keeps Treaty renders stable
    // across screenshots while retaining the softness of old iron-gall ink.
    const dx = jitter * Math.sin((i + 1) * 19.17 + first[0] * 7.1);
    const dy = jitter * Math.cos((i + 1) * 13.91 + first[1] * 5.3);
    ctx.lineTo(px(next[0] + dx), py(next[1] + dy));
  }
  ctx.stroke();
}

function renderOptions(options: SignatureRenderOptions): Required<SignatureRenderOptions> {
  return {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 1,
    height: options.height ?? 1,
    lineWidth: options.lineWidth ?? 2,
  };
}

/** Render a live signature while iron-gall ink develops from brown to black. */
export function renderDryingSignature(
  ctx: CanvasRenderingContext2D,
  strokes: TimedSignatureStroke[],
  now = Date.now(),
  options: SignatureRenderOptions = {},
) {
  const resolved = renderOptions(options);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = resolved.lineWidth;
  for (const stroke of strokes) {
    const progress = Math.min(1, Math.max(0, (now - stroke.completedAt) / 8_000));
    const red = Math.round(126 - progress * 96);
    const green = Math.round(83 - progress * 57);
    const blue = Math.round(47 - progress * 30);
    ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.72 + progress * 0.23})`;
    drawStroke(ctx, stroke, resolved);
  }
  ctx.restore();
}

/**
 * Render strokes for the Treaty finale. The helper deliberately draws only
 * ink, leaving parchment and glass to the caller. It is deterministic and
 * can therefore be used in screenshots, replay, and accessibility tests.
 */
export function renderAgedSignature(
  ctx: CanvasRenderingContext2D,
  strokes: SignatureStroke[],
  options: SignatureRenderOptions = {},
) {
  const resolved = renderOptions(options);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // The feather pass is wider and translucent; the main pass is browned ink.
  ctx.lineWidth = resolved.lineWidth * 2.2;
  ctx.strokeStyle = "rgba(76, 49, 27, 0.18)";
  for (const stroke of strokes) drawStroke(ctx, stroke, resolved, 0.0012);
  ctx.lineWidth = resolved.lineWidth;
  ctx.strokeStyle = "rgba(73, 46, 25, 0.88)";
  for (const stroke of strokes) drawStroke(ctx, stroke, resolved, 0.00035);
  ctx.restore();
}
