import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertConditioningFrameAvailable,
  reusablePinnedWorldId,
  worldAssetCacheMatches,
  worldGenerationSignature,
} from "./world-cache.mjs";
import { worlds } from "./worlds.config.mjs";

const entry = {
  scene: "example",
  prompt: "A historically grounded example.",
};

test("a prompt correction invalidates a pinned Marble take", () => {
  const oldSignature = worldGenerationSignature(entry);
  const corrected = {
    ...entry,
    prompt: `${entry.prompt} Corrected architecture.`,
    worldId: "old-world-id",
    worldSignature: oldSignature,
  };

  assert.notEqual(worldGenerationSignature(corrected), oldSignature);
  assert.equal(reusablePinnedWorldId(corrected), null);
});

test("a pin matching the current generation inputs remains reusable", () => {
  const worldSignature = worldGenerationSignature(entry);
  const pinned = { ...entry, worldId: "current-world-id", worldSignature };

  assert.equal(reusablePinnedWorldId(pinned), "current-world-id");
});

test("a conditioning-frame correction invalidates a Marble take", () => {
  const conditioned = { ...entry, image: "public/reference/example.jpg" };
  const originalFrame = { file: "example.jpg", width: 100, height: 100, prompt: "Original frame." };
  const correctedFrame = { ...originalFrame, prompt: "Corrected frame." };

  assert.notEqual(
    worldGenerationSignature(conditioned, [originalFrame]),
    worldGenerationSignature(conditioned, [correctedFrame]),
  );
});

test("a missing configured frame fails instead of permitting text-only generation", () => {
  const conditioned = { ...entry, image: "public/reference/example.jpg" };

  assert.throws(
    () => assertConditioningFrameAvailable(conditioned, false),
    /run pipeline:frames before pipeline:worlds \(refusing text-only generation\)/,
  );
  assert.doesNotThrow(() => assertConditioningFrameAvailable(conditioned, true));
  assert.doesNotThrow(() => assertConditioningFrameAvailable(entry, false));
});

test("legacy or stale local assets do not satisfy the world cache", () => {
  const signature = worldGenerationSignature(entry);

  assert.equal(worldAssetCacheMatches(entry, { worldId: "legacy-world" }), false);
  assert.equal(
    worldAssetCacheMatches(entry, {
      worldId: "stale-world",
      generationSignature: `${signature}-stale`,
    }),
    false,
  );
});

test("a generated world with current metadata remains cached without a pin", () => {
  const generationSignature = worldGenerationSignature(entry);

  assert.equal(
    worldAssetCacheMatches(entry, { worldId: "generated-world", generationSignature }),
    true,
  );
});

test("source-conditioned worlds require newly curated takes", () => {
  const correctedScenes = [
    "assembly-room",
    "griffins-wharf",
    "lexington",
    "surrender-field",
    "treaty-paris",
    "valley-forge",
  ];

  for (const scene of correctedScenes) {
    const corrected = worlds.find((world) => world.scene === scene);
    assert.ok(corrected, `${scene} config is missing`);
    assert.equal(corrected.worldId, null, `${scene} must not reuse its pre-correction pin`);
    assert.equal(corrected.worldSignature, null, `${scene} must await a newly curated take`);
  }
});

test("retained pins declare the generation inputs that produced them", () => {
  for (const pinned of worlds.filter((world) => world.worldId)) {
    assert.equal(
      pinned.worldSignature,
      worldGenerationSignature(pinned),
      `${pinned.scene} pin signature is stale`,
    );
  }
});
