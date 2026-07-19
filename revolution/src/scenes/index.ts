import type { SceneManifest } from "../engine/types";
import teaparty from "./teaparty.json";
import lexington from "./lexington.json";
import declaration from "./declaration.json";
import delaware from "./delaware.json";
import trenton from "./trenton.json";
import saratoga from "./saratoga.json";
import valleyForge from "./valley-forge.json";
import yorktown from "./yorktown.json";
import treatyParis from "./treaty-paris.json";

/** All scenes in story order. The director follows each manifest's `next`
 *  pointer; this array is the canonical order for the chapter select. */
export const scenes = [
  teaparty,
  lexington,
  declaration,
  delaware,
  trenton,
  saratoga,
  valleyForge,
  yorktown,
  treatyParis,
] as SceneManifest[];

export const sceneById = new Map(scenes.map((s) => [s.id, s]));

// The next-chain is authored by hand across nine files; break loudly if a
// manifest points at a scene that doesn't exist.
for (const scene of scenes) {
  if (scene.next && !sceneById.has(scene.next.scene)) {
    throw new Error(`scene "${scene.id}" advances to unknown scene "${scene.next.scene}"`);
  }
}
