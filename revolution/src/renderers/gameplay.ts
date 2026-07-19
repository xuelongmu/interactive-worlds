import * as THREE from "three";
import type { EngineEvent, SceneManifest } from "../engine/types";
import { DeclarationSigningScene } from "./declaration-signing";

export interface GameplaySceneOptions {
  container: HTMLElement;
  manifest: SceneManifest;
  onEvent: (event: EngineEvent) => void;
  onStatus?: (status: string) => void;
}

export interface GameplaySceneRunner {
  start(): Promise<void>;
  dispose(): void;
  setControlsLocked(locked: boolean): void;
  setPaused(paused: boolean): void;
}

/** Shared Actor base for future precise three.js interactions. */
export class GameplayScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 100);

  constructor(
    readonly manifest: SceneManifest,
    readonly onEvent: (event: EngineEvent) => void,
  ) {}
}

/** Scene-specific Actor interactions enter through one deliberately small
 * factory. The director can retain its honest placeholder for unknown IDs. */
export function createGameplayScene(options: GameplaySceneOptions): GameplaySceneRunner | null {
  if (options.manifest.id === "declaration") return new DeclarationSigningScene(options);
  return null;
}
