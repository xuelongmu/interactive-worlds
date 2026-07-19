import "./style.css";
import lexington from "../../src/scenes/lexington.json";
import type { EngineEvent, SceneManifest } from "../../src/engine/types";
import { SplatScene } from "../../src/renderers/splat";

const CONDITIONING_PROMPT = `Continue this exact camera view on Lexington Green at dawn, April 19, 1775. The frozen moment wakes in place. One isolated flintlock shot breaks the stillness; at middle and long distance the British line answers with two ragged musket volleys. White powder smoke quickly obscures both lines. Figures recoil, scatter, and move through the haze; a field drum and restrained distant cries belong in sound design, not visible spectacle. Documentary realism, historically accurate clothing and flintlocks. Violence is elided: no visible bullet impacts, no gore, no close injury, no bodies in the foreground, no triumphant framing, and no camera shake or strobe-rate flashes. Bodiless witness camera: no hands and no shadow. No text and no music. Hold the viewer's human-height camera direction, with only a slow restrained drift after the first volley. 25 seconds. The first generated frame must match the conditioning image exactly.`;

const manifest = structuredClone(lexington) as SceneManifest;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const evidenceEl = document.querySelector<HTMLElement>("#evidence")!;
const previewEl = document.querySelector<HTMLImageElement>("#preview")!;
const downloadEl = document.querySelector<HTMLAnchorElement>("#download")!;
const retakeEl = document.querySelector<HTMLButtonElement>("#retake")!;
document.querySelector<HTMLElement>("#prompt")!.textContent = CONDITIONING_PROMPT;

let scene: SplatScene;
let capturePending = false;
let captured = false;
let previewUrl: string | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function gpuEvidence(): string {
  const gl = scene.renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
}

function showEvidence(entries: [string, string][]) {
  evidenceEl.innerHTML = entries
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

async function persistSnapshot(blob: Blob): Promise<string> {
  try {
    const response = await fetch("/api/snapshot", {
      method: "POST",
      headers: { "content-type": blob.type },
      body: blob,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json() as { file?: string };
    return result.file ?? "saved by the dev server";
  } catch {
    return "browser download only (snapshot endpoint unavailable)";
  }
}

async function captureTriggerFrame() {
  if (capturePending || captured) return;
  capturePending = true;
  scene.controlsLocked = true;
  statusEl.textContent = "Trigger line crossed — preserving the exact rendered view…";

  // Render and read back in the same task because the WebGL drawing buffer is
  // not preserved between animation frames. The issue explicitly requires
  // the trigger-line canvas data URL as the conditioning image.
  scene.renderer.render(scene.scene, scene.camera);
  const dataUrl = scene.renderer.domElement.toDataURL("image/jpeg", 0.9);
  const blob = await fetch(dataUrl).then((response) => response.blob());
  if (blob.size === 0) {
    statusEl.textContent = "Capture failed. Retake after the world is fully visible.";
    scene.controlsLocked = false;
    capturePending = false;
    return;
  }

  const digest = hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  const savedPath = await persistSnapshot(blob);
  const { position, rotation } = scene.camera;
  const viewport = `${scene.renderer.domElement.width} × ${scene.renderer.domElement.height}`;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  previewEl.src = previewUrl;
  previewEl.hidden = false;
  downloadEl.href = previewUrl;
  downloadEl.download = "lexington-trigger-frame.jpg";
  downloadEl.classList.remove("disabled");
  downloadEl.removeAttribute("aria-disabled");
  retakeEl.disabled = false;
  captured = true;
  capturePending = false;

  showEvidence([
    ["Saved", savedPath],
    ["SHA-256", digest],
    ["Viewport", viewport],
    ["Zone status", "legacy scaffold; production capture blocked on issue #4 residual"],
    ["Camera position", `${position.x.toFixed(4)}, ${position.y.toFixed(4)}, ${position.z.toFixed(4)}`],
    ["Camera rotation", `${rotation.x.toFixed(4)}, ${rotation.y.toFixed(4)}, ${rotation.z.toFixed(4)}`],
    ["WebGL renderer", gpuEvidence()],
  ]);
  statusEl.textContent = viewport === "1664 × 960"
    ? "Capture ready. Controls remain locked so the review frame cannot drift."
    : `Capture ready, but ${viewport} is not the required 1664 × 960 generation size.`;
}

function handleEvent(event: EngineEvent) {
  if (event.type === "zone-enter" && event.zone === "trigger-line") {
    void captureTriggerFrame();
  }
}

scene = new SplatScene({
  container: document.querySelector<HTMLElement>("#app")!,
  manifest,
  onEvent: handleEvent,
  onReady: () => {
    statusEl.textContent = "Pinned world loaded. The current trigger line is legacy scaffold data pending issue #4's GPU authoring pass; captures are harness evidence only until that lands.";
    showEvidence([
      ["World", "dc292531-9d06-4f95-851c-0ebc32a3c73b"],
      ["Zone status", "legacy scaffold; production capture blocked on issue #4 residual"],
      ["WebGL renderer", gpuEvidence()],
    ]);
  },
});

retakeEl.addEventListener("click", () => {
  captured = false;
  retakeEl.disabled = true;
  previewEl.hidden = true;
  downloadEl.classList.add("disabled");
  downloadEl.removeAttribute("href");
  downloadEl.setAttribute("aria-disabled", "true");
  scene.controlsLocked = false;
  statusEl.textContent = "Retake armed. Leave and re-enter the trigger line when the view is correct.";
});

window.addEventListener("beforeunload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  scene.dispose();
});
