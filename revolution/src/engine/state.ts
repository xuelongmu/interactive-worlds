/** Persistent story state. The signature is stored as vector strokes so the
 *  Treaty of Paris finale can re-render it aged (browned ink, feathering). */

export interface SignatureStroke {
  /** [x, y] points normalized to the parchment quad (0..1) */
  points: [number, number][];
}

export interface StoryState {
  completedScenes: string[];
  signature: SignatureStroke[] | null;
}

const KEY = "revolution-story-state";

export function loadState(): StoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoryState;
  } catch { /* corrupted state falls through to default */ }
  return { completedScenes: [], signature: null };
}

export function saveState(state: StoryState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function markSceneComplete(sceneId: string) {
  const state = loadState();
  if (!state.completedScenes.includes(sceneId)) state.completedScenes.push(sceneId);
  saveState(state);
}

export function saveSignature(strokes: SignatureStroke[]) {
  const state = loadState();
  state.signature = strokes;
  saveState(state);
}
