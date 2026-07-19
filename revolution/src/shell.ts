import type { StoryState } from "./engine/state";
import type { SceneManifest } from "./engine/types";

export type ShellView = "title" | "chapters" | "settings";

export interface ChapterHeading {
  title: string;
  date: string;
}

/** Scene titles already carry their historically reviewed date after an em
 * dash. The shell presents the two parts separately without duplicating
 * content metadata outside the manifests. */
export function splitChapterHeading(sceneTitle: string): ChapterHeading {
  const [title, ...dateParts] = sceneTitle.split(/\s+—\s+/);
  return {
    title: title.trim(),
    date: dateParts.join(" — ").trim(),
  };
}

/** Chapter selection is intentionally unrestricted; progress is retained only
 * for Continue and completion labels. */
export function isChapterUnlocked(
  _index: number,
  _scenes: readonly Pick<SceneManifest, "id">[],
  _state: StoryState,
  _devOverride = false
): boolean {
  return true;
}

export function getResumeScene<T extends Pick<SceneManifest, "id">>(
  scenes: readonly T[],
  state: StoryState
): T | undefined {
  const current = scenes.find((scene) => scene.id === state.currentSceneId);
  return current ?? scenes.find((scene) => !state.completedScenes.includes(scene.id)) ?? scenes[0];
}

export function chapterAccessibleName(
  chapterNumber: number,
  heading: ChapterHeading,
  stateLabel: string
): string {
  return [
    `Chapter ${chapterNumber}`,
    heading.title,
    heading.date,
    stateLabel,
  ].filter(Boolean).join(", ");
}

export function getTitleAction(
  scenes: readonly Pick<SceneManifest, "id">[],
  state: StoryState
): "Begin" | "Continue" | "Begin Again" {
  if (state.currentSceneId && scenes.some((scene) => scene.id === state.currentSceneId)) {
    return "Continue";
  }
  if (scenes.length > 0 && scenes.every((scene) => state.completedScenes.includes(scene.id))) {
    return "Begin Again";
  }
  return state.completedScenes.length > 0 ? "Continue" : "Begin";
}

/** Deliberately explicit: development chapter access is never inferred from
 * the build mode and never silently changes a viewer's progress. */
export function hasChapterDevOverride(search: string): boolean {
  return new URLSearchParams(search).get("unlock") === "chapters";
}
