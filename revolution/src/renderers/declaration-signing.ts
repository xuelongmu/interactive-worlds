import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadState, saveSignature } from "../engine/state";
import type { EngineEvent } from "../engine/types";
import { SplatScene } from "./splat";
import type { GameplaySceneOptions, GameplaySceneRunner } from "./gameplay";
import { DeclarationSigningFlow } from "./declaration-flow";
import { renderDryingSignature, type TimedSignatureStroke } from "./signature";

const DESK_MODEL_ROOT = "/assets/models/tripo-p0/writing-desk/20260723T170548-0700-cleaned-v1";
const OPTIONAL_MODEL_ROOT = "/assets/models";

/** Declaration Actor scene: witness the room, approach the table, then sign. */
export class DeclarationSigningScene implements GameplaySceneRunner {
  private readonly root = document.createElement("div");
  private readonly flow: DeclarationSigningFlow;
  private establishing: SplatScene | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private animation = 0;
  private deskGroup: THREE.Group | null = null;
  private quill: THREE.Object3D | null = null;
  private parchment: THREE.Mesh | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private referenceImage: HTMLImageElement | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private locked = false;
  private paused = false;
  private phaseStartedAt = performance.now();
  private dryingTimer: number | null = null;
  private readonly timedStrokes: TimedSignatureStroke[];
  private drawing = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(private readonly options: GameplaySceneOptions) {
    const initial = loadState().signature;
    this.flow = new DeclarationSigningFlow({
      initialStrokes: initial,
      persist: (strokes) => saveSignature(strokes),
      emit: (name) => options.onEvent({ type: "action", name }),
    });
    this.timedStrokes = (initial ?? []).map((stroke) => ({ ...stroke, completedAt: 0 }));
    this.root.className = "declaration-signing";
    this.root.style.cssText = "position:absolute;inset:0;overflow:hidden;background:#17120d;color:#f1e6cf;font-family:Georgia,serif";
  }

  async start() {
    this.options.container.appendChild(this.root);
    this.showEstablishing();
  }

  private showEstablishing() {
    const stage = document.createElement("div");
    stage.style.cssText = "position:absolute;inset:0";
    const prompt = this.panel("Philadelphia Assembly Room", "The shuttered room holds its breath. Approach the writing table.");
    const approach = this.button("Approach the table");
    prompt.append(approach);
    stage.append(prompt);
    this.root.append(stage);
    this.establishing = new SplatScene({
      container: stage,
      manifest: this.options.manifest,
      onEvent: this.options.onEvent,
      onReady: () => this.options.onStatus?.("Assembly Room ready"),
    });
    approach.addEventListener("click", () => {
      if (!this.flow.approachTable()) return;
      approach.disabled = true;
      this.establishing?.dispose();
      this.establishing = null;
      stage.remove();
      this.showDesk();
    });
  }

  private showDesk() {
    const stage = document.createElement("div");
    stage.style.cssText = "position:absolute;inset:0";
    this.root.append(stage);
    this.options.onStatus?.("Dolly to the writing table");
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight);
    stage.append(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x17120d);
    scene.add(new THREE.HemisphereLight(0xf5e5c7, 0x2c2118, 1.2));
    const lamp = new THREE.DirectionalLight(0xffd6a0, 2.2);
    lamp.position.set(2, 4, 3); scene.add(lamp);
    const camera = new THREE.PerspectiveCamera(42, renderer.domElement.width / renderer.domElement.height, 0.05, 30);
    camera.position.set(0, 3.1, 4.5); camera.lookAt(0, 0.35, 0); this.camera = camera;
    const deskGroup = new THREE.Group(); this.deskGroup = deskGroup; scene.add(deskGroup);
    this.addProceduralDesk(deskGroup); this.addWritingSurface(deskGroup); this.addHand(deskGroup);
    this.quill = this.proceduralQuill();
    this.quill.position.set(1.05, 0.32, 0.35); this.quill.rotation.set(-0.3, 0.1, -0.55); this.quill.userData.quill = true; deskGroup.add(this.quill);
    void this.loadApprovedDesk(deskGroup);
    const title = this.panel("The signing table", "Pick up the quill. The blank space waits below the delegates' names.");
    this.root.append(title);
    this.bindDeskInput(renderer.domElement);
    const controls = this.panel("", "");
    controls.style.cssText += ";top:auto;bottom:24px;left:24px;right:24px;display:flex;gap:10px;align-items:center";
    const status = document.createElement("span"); status.textContent = "Click the quill";
    const finish = this.button("Finish signature"); finish.disabled = true;
    const down = this.button("Set down quill"); controls.append(status, finish, down); this.root.append(controls);
    finish.addEventListener("click", () => {
      if (!this.flow.completeSignature()) return;
      finish.disabled = true; status.textContent = "The iron-gall ink is drying…"; this.phaseStartedAt = performance.now();
      // Keep the historical eight-second drying beat, then complete the handoff
      // automatically. The button remains available as an explicit early action
      // only after the same prerequisite has elapsed.
      this.dryingTimer = window.setTimeout(() => {
        this.dryingTimer = null;
        completeQuillDown();
      }, 8_000);
    });
    const completeQuillDown = () => {
      if (!this.flow.setDown()) return;
      if (this.dryingTimer !== null) { window.clearTimeout(this.dryingTimer); this.dryingTimer = null; }
      this.options.onStatus?.("Declaration signed"); status.textContent = "Quill down."; finish.disabled = true; down.disabled = true;
    };
    down.addEventListener("click", () => {
      completeQuillDown();
    });
    const tick = () => {
      if (!this.renderer || !this.camera || this.paused) return;
      const elapsed = Math.min(1, (performance.now() - this.phaseStartedAt) / 1_600);
      const eased = 1 - (1 - elapsed) ** 3;
      this.camera.position.lerpVectors(new THREE.Vector3(0, 3.1, 4.5), new THREE.Vector3(0, 1.9, 2.6), eased);
      this.camera.lookAt(0, 0.42, 0); this.drawSignature();
      down.disabled = this.flow.phase === "drying" && performance.now() - this.phaseStartedAt < 8_000;
      renderer.render(scene, camera); this.animation = requestAnimationFrame(tick);
    };
    tick(); window.addEventListener("resize", this.onResize);
  }

  private addProceduralDesk(group: THREE.Group) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4f2f1c, roughness: 0.82 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 2.2), wood); group.add(top);
    for (const x of [-1.75, 1.75]) for (const z of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.18), wood); leg.position.set(x, -0.95, z); group.add(leg);
    }
  }

  private addWritingSurface(group: THREE.Group) {
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 520;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ead9b6"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(83,57,32,.22)"; ctx.lineWidth = 3; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.font = "18px Georgia"; ctx.fillStyle = "rgba(62,43,27,.72)"; ctx.fillText("IN CONGRESS, July 4, 1776", 54, 64);
    ctx.font = "italic 16px Georgia"; ctx.fillText("We hold these truths to be self-evident…", 54, 105); ctx.fillText("The signatures continue below.", 54, 145);
    for (let i = 0; i < 56; i++) {
      ctx.strokeStyle = "rgba(64,45,28,.42)"; ctx.lineWidth = 1; ctx.beginPath();
      const x = 0.53 + (i % 7) * 0.06; const y = 0.56 + Math.floor(i / 7) * 0.047;
      ctx.moveTo(x * canvas.width, y * canvas.height); ctx.lineTo((x + 0.035) * canvas.width, (y - 0.012) * canvas.height); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const parchment = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.48), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, side: THREE.DoubleSide }));
    parchment.rotation.x = -Math.PI / 2; parchment.position.set(0, 0.14, 0); parchment.userData.parchment = true; group.add(parchment);
    this.canvas = canvas; this.canvasContext = ctx; this.texture = texture; this.parchment = parchment;
    const reference = new Image();
    reference.onload = () => { this.referenceImage = reference; this.drawSignature(); };
    reference.src = "/reference/declaration.jpg";
  }

  private addHand(group: THREE.Group) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb77f5c, roughness: 0.9 }));
    hand.scale.set(1.1, 0.72, 1.4); hand.position.set(1.15, 0.36, 0.65); hand.rotation.set(-0.3, 0.1, -0.2); hand.visible = false;
    hand.userData.hand = true; group.add(hand);
  }

  private async loadApprovedDesk(group: THREE.Group) {
    const loader = new GLTFLoader();
    const desk = await this.loadModel(loader, "writing-desk.glb", DESK_MODEL_ROOT); if (desk) { desk.scale.setScalar(0.9); desk.position.y = -0.06; group.add(desk); }
    const inkwell = await this.loadModel(loader, "inkwell.glb", OPTIONAL_MODEL_ROOT); if (inkwell) { inkwell.scale.setScalar(0.22); inkwell.position.set(-1.25, 0.22, 0.2); group.add(inkwell); }
    const quill = await this.loadModel(loader, "quill.glb", OPTIONAL_MODEL_ROOT);
    if (quill && this.quill) {
      const fallback = this.quill;
      quill.scale.setScalar(0.35); quill.position.copy(fallback.position); quill.rotation.copy(fallback.rotation); quill.userData.quill = true;
      group.add(quill); fallback.removeFromParent(); this.quill = quill;
    }
  }

  private async loadModel(loader: GLTFLoader, filename: string, root: string) {
    try { const url = `${root}/${filename}`; const head = await fetch(url, { method: "HEAD" }); if (!head.ok || (head.headers.get("content-type") ?? "").includes("text/html")) return null; return (await loader.loadAsync(url)).scene; }
    catch { return null; }
  }

  private proceduralQuill() {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x2d1c12 })); shaft.rotation.z = Math.PI / 2.5; group.add(shaft);
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.72, 8), new THREE.MeshStandardMaterial({ color: 0xe8dfcf, roughness: 0.85 })); feather.rotation.z = -Math.PI / 2.5; feather.position.x = -0.53; group.add(feather); return group;
  }

  private bindDeskInput(element: HTMLCanvasElement) {
    const readPointer = (event: PointerEvent) => { const rect = element.getBoundingClientRect(); this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); this.raycaster.setFromCamera(this.pointer, this.camera!); };
    element.addEventListener("pointerdown", (event) => {
      if (this.locked || this.flow.phase === "complete") return; readPointer(event);
      if (this.flow.phase === "desk") { const hit = this.quill && this.raycaster.intersectObject(this.quill, true)[0]; if (hit && this.flow.pickupQuill()) { const hand = this.deskGroup?.children.find((node) => node.userData.hand); if (hand) hand.visible = true; event.preventDefault(); } return; }
      if (this.flow.phase !== "quill" || !this.parchment) return; const hit = this.raycaster.intersectObject(this.parchment)[0]; if (hit?.uv) this.drawing = this.flow.beginStroke(hit.uv.x, 1 - hit.uv.y);
    });
    element.addEventListener("pointermove", (event) => { if (!this.drawing || this.flow.phase !== "quill") return; readPointer(event); const hit = this.parchment && this.raycaster.intersectObject(this.parchment)[0]; if (hit?.uv) this.flow.appendStroke(hit.uv.x, 1 - hit.uv.y); });
    element.addEventListener("pointerup", () => {
      if (this.drawing) {
        if (this.flow.endStroke()) this.timedStrokes.push({ points: this.flow.strokes[this.flow.strokes.length - 1].points.map(([x, y]) => [x, y]), completedAt: performance.now() });
        this.drawing = false;
      }
    });
  }

  private drawSignature() {
    if (!this.canvasContext || !this.texture) return;
    this.canvasContext.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    this.canvasContext.fillStyle = "#ead9b6"; this.canvasContext.fillRect(0, 0, this.canvas!.width, this.canvas!.height);
    if (this.referenceImage) this.canvasContext.drawImage(this.referenceImage, 0, 0, this.canvas!.width, this.canvas!.height);
    const strokes = this.flow.strokes.map((stroke, index) => ({ ...stroke, completedAt: this.timedStrokes[index]?.completedAt ?? this.phaseStartedAt }));
    renderDryingSignature(this.canvasContext, strokes, performance.now()); this.texture.needsUpdate = true;
  }

  private panel(title: string, body: string) {
    const panel = document.createElement("div"); panel.style.cssText = "position:absolute;z-index:3;left:24px;top:24px;max-width:520px;padding:18px 22px;background:rgba(24,17,11,.78);border:1px solid rgba(234,217,182,.35);backdrop-filter:blur(3px)";
    if (title) { const heading = document.createElement("strong"); heading.textContent = title; heading.style.cssText = "display:block;font-size:20px;margin-bottom:6px"; panel.append(heading); }
    if (body) { const copy = document.createElement("span"); copy.textContent = body; panel.append(copy); } return panel;
  }
  private button(label: string) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.style.cssText = "margin-top:14px;padding:9px 14px;background:#e7d5b2;color:#23180f;border:1px solid #8c6d45;font:inherit;cursor:pointer"; return button; }
  private onResize = () => { if (!this.renderer || !this.camera) return; const width = this.root.clientWidth || window.innerWidth; const height = this.root.clientHeight || window.innerHeight; this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); };
  setControlsLocked(locked: boolean) { this.locked = locked; }
  setPaused(paused: boolean) { this.paused = paused; }
  dispose() { this.establishing?.dispose(); this.establishing = null; cancelAnimationFrame(this.animation); if (this.dryingTimer !== null) window.clearTimeout(this.dryingTimer); this.dryingTimer = null; window.removeEventListener("resize", this.onResize); this.renderer?.dispose(); this.renderer?.domElement.remove(); this.renderer = null; this.texture?.dispose(); this.root.remove(); }
}
