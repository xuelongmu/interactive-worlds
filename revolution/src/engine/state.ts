/** Persistent story state. The signature is stored as vector strokes so the
 *  Treaty of Paris finale can re-render it aged (browned ink, feathering). */

export interface SignatureStroke {
  /** [x, y] points normalized to the parchment quad (0..1) */
  points: [number, number][];
}

export interface StoryState {
  completedScenes: string[];
  /** The last chapter entered. Persisted at the title card so a viewer who
   * leaves mid-chapter can Continue directly into it. */
  currentSceneId: string | null;
  signature: SignatureStroke[] | null;
}

const KEY = "revolution-story-state";

export function loadState(): StoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<StoryState>;
      return {
        completedScenes: Array.isArray(stored.completedScenes)
          ? stored.completedScenes.filter((id): id is string => typeof id === "string")
          : [],
        currentSceneId: typeof stored.currentSceneId === "string" ? stored.currentSceneId : null,
        signature: Array.isArray(stored.signature) ? stored.signature : null,
      };
    }
  } catch { /* corrupted state falls through to default */ }
  return { completedScenes: [], currentSceneId: null, signature: null };
}

export function saveState(state: StoryState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function markSceneComplete(sceneId: string) {
  const state = loadState();
  if (!state.completedScenes.includes(sceneId)) state.completedScenes.push(sceneId);
  if (state.currentSceneId === sceneId) state.currentSceneId = null;
  saveState(state);
}

export function setCurrentScene(sceneId: string | null) {
  const state = loadState();
  state.currentSceneId = sceneId;
  saveState(state);
}

export function resetStoryProgress() {
  saveState({ completedScenes: [], currentSceneId: null, signature: null });
}

export function saveSignature(strokes: SignatureStroke[]) {
  const state = loadState();
  state.signature = strokes;
  saveState(state);
}
