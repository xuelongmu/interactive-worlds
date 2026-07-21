import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import type { EngineEvent, ListenerPose, SceneManifest, ZoneDef } from "../engine/types";
import { bindPointerLockClick } from "../engine/pointer-lock";
import {
  SemanticInputController,
  type InputModality,
  type SemanticLookIntent,
  type SemanticMovementIntent,
} from "../engine/semantic-input";

export interface SplatSceneOptions {
  container: HTMLElement;
  manifest: SceneManifest;
  /** override splat url (spike / dev) */
  splatUrl?: string;
  colliderUrl?: string;
  onEvent: (event: EngineEvent) => void;
  /** fires when the splat is presentable (loaded, or absent so nothing to wait for) */
  onReady?: () => void;
  /** Mount seam for the later touch HUD; this PR intentionally supplies no chrome. */
  onSemanticInputReady?: (input: SemanticInputController | null) => void;
  onInputModalityChange?: (modality: InputModality) => void;
}

export function resolveSplatMovement(
  intent: Readonly<SemanticMovementIntent>,
  yaw: number,
  speed: number,
  dt: number
): THREE.Vector3 {
  if (intent.forward === 0 && intent.strafe === 0) return new THREE.Vector3();
  return new THREE.Vector3(
    Math.sin(yaw) * -intent.forward + Math.cos(yaw) * intent.strafe,
    0,
    Math.cos(yaw) * -intent.forward - Math.sin(yaw) * intent.strafe
  ).normalize().multiplyScalar(speed * dt);
}

export function resolveSplatLook(
  yaw: number,
  pitch: number,
  intent: Readonly<SemanticLookIntent>,
  pitchLimit = 1.2
): { yaw: number; pitch: number } {
  if (intent.mode !== "delta") return { yaw, pitch };
  return {
    yaw: yaw - intent.yaw,
    pitch: THREE.MathUtils.clamp(pitch + intent.pitch, -pitchLimit, pitchLimit),
  };
}

/** Witness-register renderer: first-person walk inside a gaussian splat.
 *  - Spark SplatMesh inside a plain three.js scene
 *  - semantic movement/look from desktop or a mounted touch adapter
 *  - pointer-lock mouse look and WASD preserved at the forced walking pace
 *  - ground from Marble collider mesh when present, else flat plane
 *  - box trigger zones -> zone-enter/exit EngineEvents
 *  - debug overlay (KeyZ): zone wireframes + position readout */
export class SplatScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private keys = new Set<string>();
  private movementIntent: Readonly<SemanticMovementIntent> = { forward: 0, strafe: 0 };
  private yaw = 0;
  private captureBaseYaw = 0;
  private captureElapsed = 0;
  private readonly captureMode = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get("capture") === "1";
  private pitch = 0;
  private insideZones = new Set<string>();
  private zoneBoxes: { def: ZoneDef; box: THREE.Box3 }[] = [];
  private debugGroup = new THREE.Group();
  /** whole collider scene — Marble colliders can contain multiple meshes */
  private collider: THREE.Object3D | null = null;
  private colliderMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private eyeHeight: number;
  private speed: number;
  private inputLocked = false;
  readonly semanticInput: SemanticInputController;
  onUpdate: (dt: number) => void = () => {};
  splatMesh: SplatMesh | null = null;
  readonly worldGroup = new THREE.Group();
  private disposed = false;
  private unbindPointerLock: (() => void) | null = null;

  /** Shift the world so the collider ground under the origin sits at y=0.
   *  The world origin is the capture camera at roughly eye height, so cast
   *  from just above it — casting from the sky hits tree canopy instead.
   *  Idempotent (resets any previous shift first) because the metric-scale
   *  metadata and the collider mesh load in either order. */
  private alignGroundToOrigin() {
    if (!this.collider) return;
    this.worldGroup.position.y = 0;
    this.worldGroup.updateMatrixWorld(true);
    this.raycaster.set(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, -1, 0));
    this.raycaster.far = 100;
    const hit = this.raycaster.intersectObject(this.collider, true)[0];
    if (hit) {
      this.worldGroup.position.y -= hit.point.y;
      console.info(`[splat] ground aligned (shifted ${(-hit.point.y).toFixed(2)}m)`);
    } else {
      console.warn("[splat] no collider ground under origin — leaving world unshifted");
    }
  }

  constructor(private opts: SplatSceneOptions) {
    const { container, manifest } = opts;
    this.eyeHeight = manifest.locomotion?.eyeHeight ?? 1.65;
    this.speed = manifest.locomotion?.speed ?? 1.4; // slow, deliberate walk
    this.yaw = manifest.entry?.yaw ?? 0;
    this.captureBaseYaw = this.yaw;
    this.semanticInput = new SemanticInputController({
      onMovement: (intent) => { this.movementIntent = intent; },
      onLook: (intent) => {
        const next = resolveSplatLook(this.yaw, this.pitch, intent);
        this.yaw = next.yaw;
        this.pitch = next.pitch;
      },
      onModalityChange: (modality) => {
        if (modality === "touch") this.keys.clear();
        opts.onInputModalityChange?.(modality);
      },
    });
    opts.onSemanticInputReady?.(this.semanticInput);

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      65, container.clientWidth / container.clientHeight, 0.03, 1000
    );
    this.camera.position.set(0, this.eyeHeight, 0);
    this.camera.rotation.order = "YXZ";

    const spark = new SparkRenderer({ renderer: this.renderer });
    this.scene.add(spark);
    this.scene.add(this.worldGroup);

    const splatUrl = opts.splatUrl ?? manifest.assets.splat;
    if (splatUrl) {
      this.splatMesh = new SplatMesh({
        url: splatUrl,
        onLoad: () => {
          console.info(`[splat] loaded ${splatUrl}`);
          opts.onReady?.();
        },
      });
      // Splat files are Y-down; flip 180° around X into three.js space.
      this.splatMesh.quaternion.set(1, 0, 0, 0);
      this.worldGroup.add(this.splatMesh);
      // Marble worlds ship semantics metadata alongside (written by
      // pipeline:worlds): metric_scale_factor converts splat units → meters.
      void fetch(splatUrl.replace(/\.spz$/, ".meta.json"))
        .then((res) => (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html") ? res.json() : null))
        .then((meta: { metric_scale_factor?: number } | null) => {
          if (meta?.metric_scale_factor) {
            this.worldGroup.scale.setScalar(meta.metric_scale_factor);
            console.info(`[splat] metric scale ×${meta.metric_scale_factor.toFixed(2)}`);
            // meta and collider load in either order — re-align on both.
            this.alignGroundToOrigin();
          }
        })
        .catch(() => undefined);
    } else {
      queueMicrotask(() => opts.onReady?.());
    }

    const colliderUrl = opts.colliderUrl ?? manifest.assets.collider;
    if (colliderUrl) {
      new GLTFLoader().load(colliderUrl, (gltf) => {
        gltf.scene.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.visible = false;
            (node.material as THREE.Material & { wireframe?: boolean }).wireframe = true;
            this.colliderMeshes.push(node);
          }
        });
        // Collider shares the splat's source frame — same flip.
        gltf.scene.quaternion.set(1, 0, 0, 0);
        this.collider = gltf.scene;
        this.worldGroup.add(gltf.scene);
        this.alignGroundToOrigin();
      });
    }

    for (const def of manifest.zones) {
      const center = new THREE.Vector3(...def.pos);
      const half = new THREE.Vector3(...def.size).multiplyScalar(0.5);
      this.zoneBoxes.push({
        def,
        box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)),
      });
      const helper = new THREE.Box3Helper(
        this.zoneBoxes[this.zoneBoxes.length - 1].box, new THREE.Color(0xffaa00)
      );
      this.debugGroup.add(helper);
    }
    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);

    this.bindInput(container);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private bindInput(container: HTMLElement) {
    this.unbindPointerLock = bindPointerLockClick(container);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!document.pointerLockElement || this.controlsLocked) return;
    this.semanticInput.applyLookDelta(
      "desktop-mouse",
      e.movementX * 0.0022,
      -e.movementY * 0.0022,
      "keyboard-mouse"
    );
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.controlsLocked) return;
    this.keys.add(e.code);
    this.applyKeyboardMovement();
    if (e.code === "KeyZ") {
      this.debugGroup.visible = !this.debugGroup.visible;
      for (const mesh of this.colliderMeshes) mesh.visible = this.debugGroup.visible;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.applyKeyboardMovement();
  };
  private onBlur = () => {
    this.keys.clear();
    this.semanticInput.clear("blur");
  };
  private onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      this.keys.clear();
      this.semanticInput.clear("visibility");
    }
  };
  private onResize = () => {
    const { container } = this.opts;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  };

  get debugVisible() { return this.debugGroup.visible; }

  get controlsLocked(): boolean { return this.inputLocked; }
  set controlsLocked(locked: boolean) {
    if (locked === this.inputLocked) return;
    this.inputLocked = locked;
    this.semanticInput.setEnabled(!locked, locked ? "controls-locked" : "controls-unlocked");
    if (!locked) this.applyKeyboardMovement();
  }

  private applyKeyboardMovement(): void {
    this.semanticInput.setMovement("desktop-keyboard", {
      forward: Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      strafe: Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
    }, "keyboard-mouse");
  }

  private tick() {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (!this.controlsLocked) {
      if (this.captureMode) {
        this.captureElapsed += dt;
        this.yaw = this.captureBaseYaw + this.captureElapsed * 0.16;
        this.pitch = Math.sin(this.captureElapsed * 0.55) * 0.025;
      }
      this.camera.position.add(resolveSplatMovement(this.movementIntent, this.yaw, this.speed, dt));
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }

    // ground clamp: raycast collider from above the head, else flat ground
    if (this.collider) {
      this.raycaster.set(
        this.camera.position.clone().setY(this.camera.position.y + 2),
        new THREE.Vector3(0, -1, 0)
      );
      this.raycaster.far = 100;
      const hit = this.raycaster.intersectObject(this.collider, true)[0];
      if (hit) this.camera.position.y = hit.point.y + this.eyeHeight;
    } else {
      this.camera.position.y = this.eyeHeight;
    }

    // zone containment -> events
    for (const { def, box } of this.zoneBoxes) {
      const inside = box.containsPoint(this.camera.position);
      const was = this.insideZones.has(def.id);
      if (inside && !was) {
        this.insideZones.add(def.id);
        this.opts.onEvent({ type: "zone-enter", zone: def.id });
      } else if (!inside && was) {
        this.insideZones.delete(def.id);
        this.opts.onEvent({ type: "zone-exit", zone: def.id });
      }
    }

    this.onUpdate(dt);
    this.renderer.render(this.scene, this.camera);
  }

  get position() { return this.camera.position; }

  getAudioListenerPose(): ListenerPose {
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const up = this.camera.up.clone().applyQuaternion(this.camera.quaternion);
    return {
      position: this.camera.position.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
      up: up.toArray() as [number, number, number],
    };
  }

  /** True while any movement key is held — lets the director detect a key
   *  kept pressed through a controls-locked stretch (no new keydown fires). */
  hasMovementInput(): boolean {
    return this.movementIntent.forward !== 0
      || this.movementIntent.strafe !== 0
      || ["KeyW", "KeyA", "KeyS", "KeyD"].some((code) => this.keys.has(code));
  }

  clearPersistentInput(reason: string): void {
    this.semanticInput.clear(reason);
  }

  /** Snapshot the current view for world-model conditioning (the continuity
   *  trick: the frozen world "wakes up" in place). Render + read back in the
   *  same task — the drawing buffer isn't preserved across frames. */
  captureFrame(): Promise<Blob | null> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve) =>
      this.renderer.domElement.toBlob((blob) => resolve(blob), "image/jpeg", 0.9)
    );
  }

  dispose() {
    this.disposed = true;
    this.opts.onSemanticInputReady?.(null);
    this.semanticInput.dispose("scene-disposed");
    this.renderer.setAnimationLoop(null);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.unbindPointerLock?.();
    this.unbindPointerLock = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
