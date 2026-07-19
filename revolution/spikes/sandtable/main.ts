import "../../src/style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import saratoga from "../../src/scenes/saratoga.json";
import type { SceneManifest } from "../../src/engine/types";
import { CueEngine } from "../../src/engine/cues";
import { AudioEngine } from "../../src/engine/audio";

/** SPIKE 3 — Actor register #2: the Saratoga sand table.
 *  Questions this spike answers:
 *    1. Does a displacement-mapped tabletop read as a war-room model of
 *       Bemis Heights at orbit-camera range (no Marble world needed)?
 *    2. Do pick-up/place unit blocks + phase advancement feel legible?
 *    3. Do `action` events (unit-placed:<id>, phase-advanced:<phase>) drive
 *       the standard cue engine end-to-end (the real SAR cues ride along)?
 *
 *  The terrain is procedural (painted heightmap analog); Tripo unit blocks
 *  (pipeline/models.mjs) will replace the boxes without touching the logic.
 *  This pattern generalizes to the Yorktown siege table. */

const manifest = saratoga as SceneManifest;

// ---- table-space terrain ------------------------------------------------
// Table coords: x ∈ [-2,2] west→east, z ∈ [-1.5,1.5] north(−)→south(+).
// The Hudson runs along the east edge; Bemis Heights is the south-west
// plateau; Freeman's Farm is the clearing north-west of it.

const TABLE_W = 4;
const TABLE_D = 3;
const RELIEF = 0.35;

function smoothBump(x: number, z: number, cx: number, cz: number, r: number, amp: number) {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d >= 1) return 0;
  const t = 1 - d * d;
  return amp * t * t;
}

/** normalized terrain height (0..1) — one function drives the displacement
 *  texture, runtime queries, and block placement, so they can't disagree */
function height01(x: number, z: number): number {
  let h = 0.3;
  h += 0.02 * Math.sin(x * 5.1) + 0.02 * Math.sin(z * 4.3 + 1.7) + 0.015 * Math.sin((x + z) * 7.3);
  h += smoothBump(x, z, -0.5, 0.75, 1.35, 0.42);  // Bemis Heights plateau
  h += smoothBump(x, z, -1.4, -0.9, 0.8, 0.18);   // wooded rise past Freeman's Farm
  h += smoothBump(x, z, 0.9, -1.15, 0.9, 0.14);   // Great Redoubt rise, river side
  const river = Math.max(0, 1 - Math.abs(x - 1.78) / 0.34);
  h -= 0.3 * river * river;                        // the Hudson
  const creekZ = 0.12 - 0.15 * Math.sin(x * 1.3);
  const creek = Math.max(0, 1 - Math.abs(z - creekZ) / 0.2);
  h -= 0.15 * creek * creek * (x < 1.35 ? 1 : 0.25); // Mill Creek ravine
  return THREE.MathUtils.clamp(h, 0.02, 1);
}

const terrainY = (x: number, z: number) => height01(x, z) * RELIEF;

/** deterministic hash noise for the painted-woods stipple */
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function paintMaps(): { color: THREE.CanvasTexture; displacement: THREE.CanvasTexture } {
  const size = 512;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = size;
  const dispCanvas = document.createElement("canvas");
  dispCanvas.width = dispCanvas.height = 256;

  const cctx = colorCanvas.getContext("2d")!;
  const cimg = cctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * TABLE_W;
      const z = (py / size - 0.5) * TABLE_D;
      const h = height01(x, z);
      // painted-model palette: sand fields, mossy woods, slate river
      let r = 176 + h * 42, g = 156 + h * 40, b = 116 + h * 30;
      if (h < 0.12) { r = 52; g = 74; b = 82; }                 // water
      else if (h < 0.2) { r = 138; g = 128; b = 96; }           // banks / ravine
      const farm = Math.hypot(x + 0.55, z + 0.55) < 0.32;       // Freeman's clearing
      const woods = hash2(Math.floor(px / 6), Math.floor(py / 6)) < 0.5 && h > 0.24 && !farm;
      if (woods && hash2(px, py) < 0.7) { r *= 0.55; g *= 0.72; b *= 0.5; }
      const i = (py * size + px) * 4;
      cimg.data[i] = r; cimg.data[i + 1] = g; cimg.data[i + 2] = b; cimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  // the river road, inked on like a survey line
  cctx.strokeStyle = "rgba(92, 70, 44, 0.9)";
  cctx.lineWidth = 3;
  cctx.beginPath();
  const roadX = ((1.42 / TABLE_W) + 0.5) * size;
  cctx.moveTo(roadX, 0);
  cctx.bezierCurveTo(roadX - 14, size * 0.35, roadX + 10, size * 0.7, roadX - 6, size);
  cctx.stroke();

  const dctx = dispCanvas.getContext("2d")!;
  const dimg = dctx.createImageData(256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const x = (px / 256 - 0.5) * TABLE_W;
      const z = (py / 256 - 0.5) * TABLE_D;
      const v = height01(x, z) * 255;
      const i = (py * 256 + px) * 4;
      dimg.data[i] = dimg.data[i + 1] = dimg.data[i + 2] = v; dimg.data[i + 3] = 255;
    }
  }
  dctx.putImageData(dimg, 0, 0);

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  return { color, displacement: new THREE.CanvasTexture(dispCanvas) };
}

// ---- units --------------------------------------------------------------

interface UnitDef {
  id: string;
  label: string;
  side: "american" | "british" | "arnold";
  /** table coords at scene start (tray for placeable units) */
  start: [number, number];
  /** valid drop target; placeable units only */
  slot?: { pos: [number, number]; radius: number };
}

const UNITS: UnitDef[] = [
  // American brigades — start on the map tray, get placed on the heights
  { id: "morgan-rifles", label: "Morgan's riflemen", side: "american", start: [-1.75, 1.62], slot: { pos: [-1.15, 0.5], radius: 0.28 } },
  { id: "dearborn-light", label: "Dearborn's light infantry", side: "american", start: [-1.4, 1.62], slot: { pos: [-0.8, 0.42], radius: 0.28 } },
  { id: "poor-brigade", label: "Poor's brigade", side: "american", start: [-1.05, 1.62], slot: { pos: [-0.45, 0.5], radius: 0.28 } },
  { id: "learned-brigade", label: "Learned's brigade", side: "american", start: [-0.7, 1.62], slot: { pos: [-0.08, 0.58], radius: 0.28 } },
  // fixed markers
  { id: "gates-hq", label: "Gates — headquarters", side: "american", start: [-0.35, 0.95] },
  { id: "fraser-advance", label: "Fraser — advance corps", side: "british", start: [-1.0, -0.75] },
  { id: "specht-center", label: "Specht — centre column", side: "british", start: [-0.2, -0.9] },
  { id: "riedesel-river", label: "Riedesel — river road", side: "british", start: [0.85, -0.8] },
  { id: "breymann-redoubt", label: "Breymann redoubt", side: "british", start: [-1.25, -0.98] },
  { id: "burgoyne-camp", label: "Burgoyne — camp", side: "british", start: [0.45, -1.25] },
];

// ---- historical movement mode ("what actually happened") ---------------

interface Move { unit: string; path: [number, number][]; start: number; dur: number }

const HISTORY: Record<string, Move[]> = {
  "freemans-farm": [
    { unit: "fraser-advance", path: [[-1.0, -0.75], [-1.15, -0.4], [-0.8, -0.5]], start: 0, dur: 5 },
    { unit: "specht-center", path: [[-0.2, -0.9], [-0.5, -0.6], [-0.55, -0.52]], start: 0.8, dur: 5 },
    { unit: "morgan-rifles", path: [[-1.15, 0.5], [-1.15, -0.05], [-0.85, -0.42]], start: 2.2, dur: 5.5 },
    { unit: "dearborn-light", path: [[-0.8, 0.42], [-0.75, -0.05], [-0.62, -0.38]], start: 2.8, dur: 5.5 },
    { unit: "poor-brigade", path: [[-0.45, 0.5], [-0.52, 0.05], [-0.5, -0.3]], start: 3.6, dur: 5.5 },
    // dusk — the Americans fall back to the heights; the British hold the field
    { unit: "morgan-rifles", path: [[-0.85, -0.42], [-1.15, 0.5]], start: 10, dur: 3.5 },
    { unit: "dearborn-light", path: [[-0.62, -0.38], [-0.8, 0.42]], start: 10.4, dur: 3.5 },
    { unit: "poor-brigade", path: [[-0.5, -0.3], [-0.45, 0.5]], start: 10.8, dur: 3.5 },
  ],
  "bemis-heights": [
    // Burgoyne's reconnaissance-in-force reaches for the American left…
    { unit: "fraser-advance", path: [[-0.8, -0.5], [-0.95, -0.15], [-0.85, 0.0]], start: 0, dur: 4.5 },
    { unit: "specht-center", path: [[-0.55, -0.52], [-0.45, -0.25]], start: 0.6, dur: 4 },
    { unit: "riedesel-river", path: [[0.85, -0.8], [0.35, -0.45]], start: 1.2, dur: 4 },
    // …and is thrown back onto its own works
    { unit: "morgan-rifles", path: [[-1.15, 0.5], [-1.3, 0.0], [-1.05, -0.35]], start: 4.5, dur: 4.5 },
    { unit: "poor-brigade", path: [[-0.45, 0.5], [-0.55, 0.05], [-0.6, -0.2]], start: 5, dur: 4.5 },
    { unit: "learned-brigade", path: [[-0.08, 0.58], [-0.2, 0.1], [-0.3, -0.15]], start: 5.5, dur: 4.5 },
    { unit: "fraser-advance", path: [[-0.85, 0.0], [-0.9, -0.55]], start: 9.5, dur: 3 },
    { unit: "specht-center", path: [[-0.45, -0.25], [-0.35, -0.7]], start: 9.5, dur: 3 },
    { unit: "riedesel-river", path: [[0.35, -0.45], [0.7, -0.85]], start: 9.5, dur: 3 },
  ],
  "charge": [
    // Arnold, without orders, from the American line to the Breymann redoubt
    { unit: "arnold", path: [[-0.3, 0.6], [-0.7, 0.1], [-1.0, -0.45], [-1.25, -0.9]], start: 0, dur: 7 },
    { unit: "morgan-rifles", path: [[-1.05, -0.35], [-1.35, -0.8]], start: 2, dur: 5 },
    { unit: "learned-brigade", path: [[-0.3, -0.15], [-1.05, -0.75]], start: 2.5, dur: 5 },
  ],
  "surrender": [
    { unit: "fraser-advance", path: [[-0.9, -0.55], [-0.1, -0.45]], start: 0, dur: 4 },
    { unit: "specht-center", path: [[-0.35, -0.7], [0.05, -0.5]], start: 0.4, dur: 4 },
    { unit: "riedesel-river", path: [[0.7, -0.85], [0.25, -0.5]], start: 0.8, dur: 4 },
    { unit: "burgoyne-camp", path: [[0.45, -1.25], [0.1, -0.6]], start: 1.2, dur: 4.5 },
  ],
};

// ---- phases -------------------------------------------------------------

const PHASES = [
  { id: "deploy", label: "Deploy — place the four American brigades on the heights", needsPlacement: true },
  { id: "freemans-farm", label: "September 19 — Freeman's Farm", history: true },
  { id: "bemis-heights", label: "October 7 — Bemis Heights", history: true },
  { id: "charge", label: "Arnold's charge", history: true },
  { id: "surrender", label: "October 17 — the surrender", history: true },
] as const;

// ---- scene --------------------------------------------------------------

const app = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
const banner = document.getElementById("banner")!;
const subtitleEl = document.getElementById("subtitle")!;

banner.innerHTML = `<b>Sand table prototype</b> — Bemis Heights as a war-room model.
  Drag the blue brigades onto their marked positions, then advance the phases.
  Tripo blocks (<code>pipeline:models</code>) will replace the painted boxes.`;

const audio = new AudioEngine();
audio.onSubtitle = (text) => { subtitleEl.textContent = text ?? ""; };
document.addEventListener("click", () => audio.ensure(), { once: true });

const cueLog: string[] = [];
const cueEngine = new CueEngine(manifest.cues, {
  play: (cue) =>
    audio.playVoice({
      url: `/assets/audio/vo/${cue.id}.mp3`,
      subtitle: cue.subtitle,
      bus: cue.diegetic ? "diegetic" : "narration",
    }),
  action: (cue) => cueLog.unshift(cue.id + (cue.then ? ` → ${cue.then}` : "")),
});

const emit = (name: string) => cueEngine.handleEvent({ type: "action", name });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14110d);
scene.fog = new THREE.Fog(0x14110d, 6, 12);

const camera = new THREE.PerspectiveCamera(46, app.clientWidth / app.clientHeight, 0.05, 40);
camera.position.set(0, 2.7, 2.9);

// constrained above the table: no diving under, no flying to the moon
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.12, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.4;
controls.maxDistance = 5.5;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI * 0.42;

scene.add(new THREE.HemisphereLight(0xf4e6c8, 0x2a2118, 0.75));
const lantern = new THREE.DirectionalLight(0xffd9a0, 1.6);
lantern.position.set(2.5, 4, 1.5);
scene.add(lantern);

// the table itself
const table = new THREE.Mesh(
  new THREE.BoxGeometry(TABLE_W + 0.5, 0.16, TABLE_D + 0.5),
  new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 })
);
table.position.y = -0.08;
scene.add(table);

const { color, displacement } = paintMaps();
const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(TABLE_W, TABLE_D, 200, 150),
  new THREE.MeshStandardMaterial({
    map: color,
    displacementMap: displacement,
    displacementScale: RELIEF,
    roughness: 0.95,
  })
);
terrain.rotation.x = -Math.PI / 2;
scene.add(terrain);

// unit blocks — painted wood
const unitMeshes = new Map<string, THREE.Mesh>();
const SIDE_COLOR = { american: 0x2b4a75, british: 0xa33c2e, arnold: 0xc8a049 };
for (const def of UNITS) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.11),
    new THREE.MeshStandardMaterial({ color: SIDE_COLOR[def.side], roughness: 0.6 })
  );
  mesh.userData.def = def;
  const [x, z] = def.start;
  mesh.position.set(x, terrainY(x, z) + 0.03, z);
  if (def.side === "arnold") mesh.visible = false; // enters with the charge
  scene.add(mesh);
  unitMeshes.set(def.id, mesh);
}

// slot rings, shown while dragging
const slotRings = new Map<string, THREE.Mesh>();
for (const def of UNITS) {
  if (!def.slot) continue;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(def.slot.radius - 0.02, def.slot.radius, 48),
    new THREE.MeshBasicMaterial({ color: 0xc8a049, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  const [sx, sz] = def.slot.pos;
  ring.position.set(sx, terrainY(sx, sz) + 0.012, sz);
  ring.visible = false;
  scene.add(ring);
  slotRings.set(def.id, ring);
}

// ---- drag & drop --------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging: THREE.Mesh | null = null;
let dragOrigin: THREE.Vector3 | null = null;
let hovered: UnitDef | null = null;
let grabbedOnce = false;
const placed = new Set<string>();
let historyPlaying = false;

function pointerRay(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (historyPlaying) return;
  pointerRay(event);
  const hit = raycaster.intersectObjects([...unitMeshes.values()].filter((m) => m.visible))[0];
  const def = hit?.object.userData.def as UnitDef | undefined;
  if (!def?.slot) return; // only the placeable brigades are grabbable
  dragging = hit!.object as THREE.Mesh;
  dragOrigin = dragging.position.clone();
  controls.enabled = false;
  slotRings.get(def.id)!.visible = true;
  if (!grabbedOnce) { grabbedOnce = true; emit("unit-grabbed"); }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  pointerRay(event);
  if (dragging) {
    const hit = raycaster.intersectObject(terrain)[0];
    if (hit) {
      const x = THREE.MathUtils.clamp(hit.point.x, -TABLE_W / 2, TABLE_W / 2);
      const z = THREE.MathUtils.clamp(hit.point.z, -TABLE_D / 2, TABLE_D / 2 + 0.3);
      dragging.position.set(x, terrainY(x, z) + 0.1, z);
      const def = dragging.userData.def as UnitDef;
      const ring = slotRings.get(def.id)!;
      const near = Math.hypot(x - def.slot!.pos[0], z - def.slot!.pos[1]) <= def.slot!.radius;
      (ring.material as THREE.MeshBasicMaterial).color.set(near ? 0x7fae6a : 0xc8a049);
    }
  } else {
    const hit = raycaster.intersectObjects([...unitMeshes.values()].filter((m) => m.visible))[0];
    hovered = (hit?.object.userData.def as UnitDef) ?? null;
  }
});

renderer.domElement.addEventListener("pointerup", () => {
  if (!dragging) return;
  const def = dragging.userData.def as UnitDef;
  const { pos, radius } = def.slot!;
  const near = Math.hypot(dragging.position.x - pos[0], dragging.position.z - pos[1]) <= radius;
  if (near) {
    dragging.position.set(pos[0], terrainY(pos[0], pos[1]) + 0.03, pos[1]);
    if (!placed.has(def.id)) {
      placed.add(def.id);
      emit(`unit-placed:${def.id}`);
    }
  } else if (dragOrigin) {
    dragging.position.copy(dragOrigin); // invalid position — the block goes back
  }
  slotRings.get(def.id)!.visible = false;
  dragging = null;
  dragOrigin = null;
  controls.enabled = true;
});

// ---- phase machine ------------------------------------------------------

let phaseIndex = 0;
let historyClock = 0;
let historyMoves: Move[] = [];
let historyDone = false;
let chargeEventsArmed = false;

function currentPhase() { return PHASES[phaseIndex]; }

function canAdvance(): boolean {
  const phase = currentPhase();
  if (historyPlaying) return false;
  if ("needsPlacement" in phase && phase.needsPlacement) {
    return UNITS.filter((u) => u.slot).every((u) => placed.has(u.id));
  }
  if ("history" in phase && phase.history) return historyDone;
  return true;
}

function advancePhase(force = false) {
  if (!force && !canAdvance()) return;
  if (phaseIndex >= PHASES.length - 1) return;
  phaseIndex++;
  historyDone = false;
  const phase = currentPhase();
  emit("phase-advanced");
  emit(`phase-advanced:${phase.id}`);
  if (phase.id === "charge") {
    const arnold = unitMeshes.get("arnold");
    // Arnold enters the story here
    if (!arnold) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.09, 0.14),
        new THREE.MeshStandardMaterial({ color: SIDE_COLOR.arnold, roughness: 0.5 })
      );
      mesh.userData.def = { id: "arnold", label: "Arnold", side: "arnold", start: [-0.3, 0.6] } as UnitDef;
      mesh.position.set(-0.3, terrainY(-0.3, 0.6) + 0.045, 0.6);
      scene.add(mesh);
      unitMeshes.set("arnold", mesh);
    } else {
      arnold.visible = true;
      arnold.position.set(-0.3, terrainY(-0.3, 0.6) + 0.045, 0.6);
    }
    chargeEventsArmed = true;
  }
}

function playHistory() {
  const phase = currentPhase();
  if (!("history" in phase) || !phase.history || historyPlaying) return;
  historyMoves = HISTORY[phase.id] ?? [];
  historyClock = 0;
  historyPlaying = true;
}

function updateHistory(dt: number) {
  if (!historyPlaying) return;
  historyClock += dt;
  let allDone = true;
  for (const move of historyMoves) {
    const mesh = unitMeshes.get(move.unit);
    if (!mesh) continue;
    const t = (historyClock - move.start) / move.dur;
    if (t < 0) { allDone = false; continue; }
    if (t < 1) allDone = false;
    const tc = THREE.MathUtils.clamp(t, 0, 1);
    // linear over the waypoint polyline
    const segs = move.path.length - 1;
    const f = tc * segs;
    const i = Math.min(Math.floor(f), segs - 1);
    const [ax, az] = move.path[i];
    const [bx, bz] = move.path[i + 1];
    const k = f - i;
    const x = ax + (bx - ax) * k;
    const z = az + (bz - az) * k;
    mesh.position.set(x, terrainY(x, z) + 0.03 + Math.sin(tc * Math.PI) * 0.015, z);
  }
  if (allDone) {
    historyPlaying = false;
    historyDone = true;
    const phase = currentPhase();
    if (phase.id === "charge" && chargeEventsArmed) {
      chargeEventsArmed = false;
      // the burst events the real scene gets from the world model
      cueEngine.handleEvent({ type: "model-event", name: "redoubt-taken" });
      setTimeout(() => {
        cueEngine.handleEvent({ type: "model-event", name: "charge-end" });
        advancePhase(true); // the table re-forms as the surrender
        playHistory();
      }, 4000);
    }
  }
}

// N advances (force-skip in dev), H plays the historical movements
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyN") advancePhase(true);
  if (e.code === "KeyH") playHistory();
});

// ---- HUD / loop ---------------------------------------------------------

const hudButtons = document.createElement("div");
hudButtons.style.cssText = "position:fixed;bottom:16px;left:12px;display:flex;gap:8px;z-index:25";
hudButtons.innerHTML = `
  <button id="history" class="secondary">Play “what actually happened” (H)</button>
  <button id="advance">Advance phase (N)</button>`;
document.body.appendChild(hudButtons);
const historyBtn = document.getElementById("history") as HTMLButtonElement;
const advanceBtn = document.getElementById("advance") as HTMLButtonElement;
historyBtn.addEventListener("click", () => playHistory());
advanceBtn.addEventListener("click", () => advancePhase());

setInterval(() => {
  const phase = currentPhase();
  const placeable = UNITS.filter((u) => u.slot);
  historyBtn.disabled = !("history" in phase && phase.history) || historyPlaying || historyDone;
  advanceBtn.disabled = !canAdvance() || phaseIndex >= PHASES.length - 1;
  hud.innerHTML = `<b>${manifest.title}</b><br/>
    phase: <b>${phase.label}</b><br/>
    ${phase.id === "deploy" ? `placed ${placed.size}/${placeable.length} — drag blue blocks to their rings<br/>` : ""}
    ${hovered ? `unit: <b>${hovered.label}</b><br/>` : ""}
    drag to orbit · scroll to zoom<br/>
    cues fired:<br/>${cueLog.slice(0, 6).map((c) => `&nbsp;&nbsp;${c}`).join("<br/>") || "&nbsp;&nbsp;—"}`;
}, 250);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  cueEngine.update(dt);
  updateHistory(dt);
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = app.clientWidth / app.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(app.clientWidth, app.clientHeight);
});

cueEngine.handleEvent({ type: "scene-start" });
