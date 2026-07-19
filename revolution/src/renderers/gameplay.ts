import * as THREE from "three";
import type { EngineEvent, SceneManifest } from "../engine/types";

/** Actor-register renderer: precise three.js interactions (signing desk,
 *  Saratoga/Yorktown sand tables) built from Tripo-generated GLBs.
 *
 *  M2 scope — this base class establishes the contract: a gameplay scene
 *  owns a three.js scene + camera and reports interactions as `action`
 *  EngineEvents (approach-table, quill-pickup, sign-complete, quill-down),
 *  which drive cues exactly like zones do in splat scenes. The signing
 *  interaction additionally records vector strokes via engine/state.ts. */
export class GameplayScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(
    readonly manifest: SceneManifest,
    readonly onEvent: (event: EngineEvent) => void
  ) {
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);
  }
}
