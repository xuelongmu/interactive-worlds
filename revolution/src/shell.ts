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

/** Presentation-only pause enhancement. The director continues to own pause
 * state, navigation, input release, focus trapping, and settings lifecycle. */
export function enhancePausePresentation(stage: HTMLElement, heading: ChapterHeading) {
  const dialog = stage.querySelector<HTMLElement>(".pause-overlay");
  if (!dialog) return;
  dialog.dataset.accessibilityLayer = "pause-menu";
  dialog.setAttribute("aria-describedby", "pause-description pause-shortcuts");

  const menu = dialog.querySelector<HTMLElement>(".pause-menu");
  const title = menu?.querySelector<HTMLElement>("#pause-title");
  if (title) title.textContent = heading.title || "American Revolution";

  const kicker = menu?.querySelector<HTMLElement>(".card-kicker");
  if (kicker) kicker.textContent = "Chapter paused";

  if (menu && !menu.querySelector("#pause-description")) {
    const description = document.createElement("p");
    description.id = "pause-description";
    description.className = "pause-description";
    description.textContent = heading.date
      ? `${heading.title} · ${heading.date}`
      : heading.title;
    title?.insertAdjacentElement("afterend", description);
  }

  const resume = dialog.querySelector<HTMLButtonElement>('[data-pause-action="resume"]');
  resume?.setAttribute("aria-keyshortcuts", "Escape P");
  const chapters = dialog.querySelector<HTMLButtonElement>('[data-pause-action="chapters"]');
  if (chapters) {
    chapters.textContent = "Chapter select";
    chapters.setAttribute("aria-label", "Open chapter select");
  }

  if (menu && !menu.querySelector("#pause-shortcuts")) {
    const shortcuts = document.createElement("p");
    shortcuts.id = "pause-shortcuts";
    shortcuts.className = "pause-shortcuts";
    shortcuts.innerHTML = '<kbd>Esc</kbd> or <kbd>P</kbd> to resume';
    menu.appendChild(shortcuts);
  }
}
