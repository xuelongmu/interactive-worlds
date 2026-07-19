/**
 * Static validation for the pinned Lexington Marble take.
 *
 * This intentionally does not assert visual placement. It mirrors the
 * SplatScene transform and ground-raycast path, then checks only facts that
 * can be established from the manifest, metadata, and collider.
 *
 * Run from revolution/:
 *   node artifacts/lexington/validate-collider.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

const root = fileURLToPath(new URL("../..", import.meta.url));
const manifestPath = resolve(root, "src/scenes/lexington.json");
const metadataPath = resolve(root, "public/assets/worlds/lexington.meta.json");
const colliderPath = resolve(root, "public/assets/worlds/lexington-collider.glb");
const configPath = resolve(root, "pipeline/worlds.config.mjs");

const [manifest, metadata, config] = await Promise.all([
  readJson(manifestPath),
  readJson(metadataPath),
  import(pathToFileURL(configPath).href),
]);
const pin = config.worlds.find((world) => world.scene === "lexington");

assert(pin, "Lexington is missing from pipeline/worlds.config.mjs");
assert(metadata.worldId === pin.worldId, "Local metadata does not match the pinned Lexington world id");
assert(Number.isFinite(metadata.metric_scale_factor) && metadata.metric_scale_factor > 0,
  "metric_scale_factor must be a positive number");
assert(Number.isFinite(metadata.ground_plane_offset), "ground_plane_offset must be a number");
assert(Number.isFinite(manifest.entry?.yaw), "Lexington must define a numeric entry yaw");

const bytes = await readFile(colliderPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolveLoad, rejectLoad) =>
  new GLTFLoader().parse(arrayBuffer, "", resolveLoad, rejectLoad)
);

const worldGroup = new THREE.Group();
worldGroup.scale.setScalar(metadata.metric_scale_factor);
gltf.scene.quaternion.set(1, 0, 0, 0); // same 180-degree X flip as SplatScene
worldGroup.add(gltf.scene);
const scene = new THREE.Scene();
scene.add(worldGroup);
scene.updateMatrixWorld(true);

let meshCount = 0;
let triangleCount = 0;
gltf.scene.traverse((node) => {
  if (!(node instanceof THREE.Mesh)) return;
  meshCount += 1;
  const positions = node.geometry.attributes.position;
  triangleCount += node.geometry.index ? node.geometry.index.count / 3 : positions.count / 3;
});
assert(meshCount > 0, "Collider contains no meshes");

const boundsBeforeAlignment = new THREE.Box3().setFromObject(gltf.scene);
const raycaster = new THREE.Raycaster(
  new THREE.Vector3(0, 0.5, 0),
  new THREE.Vector3(0, -1, 0),
  0,
  100
);
const originHit = raycaster.intersectObject(gltf.scene, true)[0];
assert(originHit, "Collider has no ground hit below the entry origin");

const groundShift = -originHit.point.y;
worldGroup.position.y = groundShift;
scene.updateMatrixWorld(true);
const boundsAfterAlignment = new THREE.Box3().setFromObject(gltf.scene);

const eyeHeight = manifest.locomotion?.eyeHeight ?? 1.65;
const entryHit = surfaceBelow(0, eyeHeight + 2, 0);
assert(entryHit, "Collider has no runtime ground hit below the entry camera");
const entryCameraY = entryHit.point.y + eyeHeight;

const cueZoneIds = new Set(
  manifest.cues.map((cue) => cue.trigger?.zone).filter(Boolean)
);
const zoneChecks = manifest.zones.map((zone) => {
  const surface = surfaceBelow(zone.pos[0], eyeHeight + 2, zone.pos[2]);
  const cameraY = surface ? surface.point.y + eyeHeight : null;
  const bottom = zone.pos[1] - zone.size[1] / 2;
  const top = zone.pos[1] + zone.size[1] / 2;
  return {
    id: zone.id,
    cueReference: cueZoneIds.has(zone.id),
    centerSurfaceY: surface ? rounded(surface.point.y) : null,
    derivedCameraY: cameraY === null ? null : rounded(cameraY),
    cameraInsideVerticalExtent: cameraY !== null && cameraY >= bottom && cameraY <= top,
  };
});

assert(zoneChecks.length === 5, `Expected five Lexington zones, found ${zoneChecks.length}`);
assert(zoneChecks.every((zone) => zone.cueReference), "Every Lexington zone must be referenced by a cue");
assert(zoneChecks.every((zone) => zone.centerSurfaceY !== null),
  "Every current zone center must have collider support below the runtime probe");
assert(zoneChecks.every((zone) => zone.cameraInsideVerticalExtent),
  "A derived eye-height camera falls outside a current zone's vertical extent");

const report = {
  scope: "static-collider-validation-only",
  worldId: metadata.worldId,
  entry: {
    yaw: manifest.entry.yaw,
    eyeHeight,
    alignedGroundY: rounded(entryHit.point.y),
    derivedCameraY: rounded(entryCameraY),
  },
  transforms: {
    metricScaleFactor: metadata.metric_scale_factor,
    metadataGroundPlaneOffset: metadata.ground_plane_offset,
    colliderGroundShift: rounded(groundShift),
    metadataColliderDelta: rounded(groundShift - metadata.ground_plane_offset),
  },
  collider: {
    meshCount,
    triangleCount,
    boundsBeforeAlignment: box(boundsBeforeAlignment),
    boundsAfterAlignment: box(boundsAfterAlignment),
  },
  zones: zoneChecks,
  limitations: [
    "Collider support does not establish that a zone matches visible people or landmarks.",
    "Entry view, real-world walk, cue placement, and async-veto snapshots require a GPU browser run.",
  ],
};

console.log(JSON.stringify(report, null, 2));

function surfaceBelow(x, y, z) {
  raycaster.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 100;
  return raycaster.intersectObject(gltf.scene, true)[0] ?? null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function vector(vectorValue) {
  return {
    x: rounded(vectorValue.x),
    y: rounded(vectorValue.y),
    z: rounded(vectorValue.z),
  };
}

function box(boxValue) {
  return { min: vector(boxValue.min), max: vector(boxValue.max) };
}
