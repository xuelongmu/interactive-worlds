import { basename } from "node:path";
import { frameGenerationSignature, frames } from "./frames.mjs";
import { hash } from "./lib.mjs";

export const WORLD_MODEL = "marble-1.1-plus";

/** Never substitute text-only generation for a configured conditioning frame. */
export function assertConditioningFrameAvailable(entry, imageAvailable) {
  if (entry.image && !imageAvailable) {
    throw new Error(
      `${entry.scene}: starting frame ${entry.image} is required; ` +
      `run pipeline:frames before pipeline:worlds (refusing text-only generation)`,
    );
  }
}

/** Hash every committed input that identifies a Marble take. */
export function worldGenerationSignature(entry, frameDefinitions = frames) {
  const imageFile = entry.image ? basename(entry.image) : null;
  const conditioningFrame = imageFile
    ? frameDefinitions.find((frame) => frame.file === imageFile)
    : null;
  if (imageFile && !conditioningFrame && !entry.imageSignature) {
    throw new Error(
      `${entry.scene}: ${imageFile} is missing from the frame pipeline and has no imageSignature`,
    );
  }
  return hash({
    model: WORLD_MODEL,
    image: entry.image ?? null,
    imageSignature: conditioningFrame
      ? frameGenerationSignature(conditioningFrame)
      : entry.imageSignature ?? null,
    prompt: entry.prompt,
  });
}

/** A pin is safe only when it was recorded for the current generation inputs. */
export function reusablePinnedWorldId(entry, signature = worldGenerationSignature(entry)) {
  if (!entry.worldId || entry.worldSignature !== signature) return null;
  return entry.worldId;
}

/** Generated assets are reusable only when their metadata matches current inputs. */
export function worldAssetCacheMatches(entry, metadata) {
  if (!metadata?.worldId) return false;
  const signature = worldGenerationSignature(entry);
  if (metadata.generationSignature !== signature) return false;
  const pinnedWorldId = reusablePinnedWorldId(entry, signature);
  return !pinnedWorldId || metadata.worldId === pinnedWorldId;
}
