import type { SceneManifest } from "./types";

export interface NarrativeBeat {
  readonly index: number;
  readonly sceneId: string;
  readonly cueId: string;
  readonly sceneIndex: number;
  readonly cueIndex: number;
}

export interface BeatNavigationAvailability {
  readonly previous: boolean;
  readonly next: boolean;
}

export interface BeatNavigationSnapshot {
  readonly kind: "beat-navigation-v1";
  readonly current: NarrativeBeat | null;
  readonly availability: BeatNavigationAvailability;
  readonly transitioning: boolean;
  readonly error: string | null;
}

export type BeatNavigationDirection = "next" | "previous";

export type BeatNavigationResult =
  | Readonly<{ status: "navigated"; direction: BeatNavigationDirection; from: NarrativeBeat; to: NarrativeBeat }>
  | Readonly<{ status: "clamped"; direction: BeatNavigationDirection; at: NarrativeBeat | null }>
  | Readonly<{ status: "busy"; direction: BeatNavigationDirection; at: NarrativeBeat | null }>
  | Readonly<{ status: "error"; direction: BeatNavigationDirection; at: NarrativeBeat | null; message: string }>;

export function canonicalNarrativeBeats(manifests: readonly SceneManifest[]): readonly NarrativeBeat[] {
  return Object.freeze(manifests.flatMap((scene, sceneIndex) =>
    scene.cues.map((cue, cueIndex) => Object.freeze({
      index: 0,
      sceneId: scene.id,
      cueId: cue.id,
      sceneIndex,
      cueIndex,
    }))
  ).map((beat, index) => Object.freeze({ ...beat, index })));
}

export function beatAvailability(
  beats: readonly NarrativeBeat[],
  current: NarrativeBeat | null,
): BeatNavigationAvailability {
  if (!current || beats.length === 0) return { previous: false, next: false };
  return { previous: current.index > 0, next: current.index < beats.length - 1 };
}

export function adjacentBeat(
  beats: readonly NarrativeBeat[],
  current: NarrativeBeat | null,
  direction: BeatNavigationDirection,
): NarrativeBeat | null {
  if (!current) return null;
  const index = current.index + (direction === "next" ? 1 : -1);
  return beats[index] ?? null;
}

/** Shared transition primitive: cleanup must fully settle before the target
 * enters, so no narration, timers, pending commands, or retained input can
 * cross a beat boundary. */
export async function executeBeatTransition(
  target: NarrativeBeat,
  hooks: {
    cleanup(): void | Promise<void>;
    enter(target: NarrativeBeat): void | Promise<void>;
  },
): Promise<void> {
  await hooks.cleanup();
  await hooks.enter(target);
}
