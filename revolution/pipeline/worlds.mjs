/** World Labs Marble → walkable splat worlds.
 *  For each configured scene: generate (or reuse worldId), poll, then download
 *  the .spz splat + collider mesh into public/assets/worlds/.
 *
 *  Usage:
 *    node pipeline/worlds.mjs                 # all scenes without local assets
 *    node pipeline/worlds.mjs lexington       # one scene
 *    node pipeline/worlds.mjs lexington --world-id <id>   # adopt an existing world
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, projectRoot, download, pollUntil } from "./lib.mjs";
import {
  assertConditioningFrameAvailable,
  reusablePinnedWorldId,
  WORLD_MODEL,
  worldAssetCacheMatches,
  worldGenerationSignature,
} from "./world-cache.mjs";
import { worlds } from "./worlds.config.mjs";

const API = "https://api.worldlabs.ai/marble/v1";
const key = requireKey("WORLDLABS_API_KEY", "world generation");
const headers = { "WLT-Api-Key": key, "Content-Type": "application/json" };

const [, , sceneArg, ...rest] = process.argv;
const worldIdFlag = rest.includes("--world-id") ? rest[rest.indexOf("--world-id") + 1] : null;

/** Upload a local image and return its media_asset_id. */
async function uploadMediaAsset(localPath) {
  const fileName = localPath.split("/").pop();
  const prepare = await fetch(`${API}/media-assets:prepare_upload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ file_name: fileName, kind: "image", extension: "jpg" }),
  });
  if (!prepare.ok) throw new Error(`prepare_upload failed ${prepare.status}: ${await prepare.text()}`);
  const body = await prepare.json();
  const uploadUrl = body.upload_info?.upload_url;
  const assetId = body.media_asset?.media_asset_id;
  if (!uploadUrl || !assetId) {
    throw new Error(`unexpected prepare_upload response: ${JSON.stringify(body).slice(0, 400)}`);
  }
  const put = await fetch(uploadUrl, {
    method: body.upload_info?.upload_method ?? "PUT",
    headers: body.upload_info?.required_headers ?? {},
    body: readFileSync(resolve(projectRoot, localPath)),
  });
  if (!put.ok) throw new Error(`media upload failed ${put.status}: ${await put.text()}`);
  return assetId;
}

async function generateWorld(entry) {
  console.log(`\n=== ${entry.scene} ===`);
  const generationSignature = worldGenerationSignature(entry);
  const pinnedWorldId = reusablePinnedWorldId(entry, generationSignature);
  if (!worldIdFlag && entry.worldId && !pinnedWorldId) {
    console.log("pinned world does not match the current prompt; generating a new take");
  }
  let worldId = worldIdFlag ?? pinnedWorldId;

  if (!worldId) {
    const imageAvailable = entry.image
      ? existsSync(resolve(projectRoot, entry.image))
      : false;
    assertConditioningFrameAvailable(entry, imageAvailable);
    // Configured scenes are image-prompted from pipeline/frames.mjs; scenes
    // without an image remain text-only. marble-1.1-plus = larger worlds.
    let worldPrompt = { type: "text", text_prompt: entry.prompt };
    if (entry.image) {
      console.log(`uploading starting frame ${entry.image}…`);
      const assetId = await uploadMediaAsset(entry.image);
      worldPrompt = {
        type: "image",
        image_prompt: { source: "media_asset", media_asset_id: assetId },
        text_prompt: entry.prompt,
      };
    }
    console.log("generating (typically ~5 minutes)…");
    const res = await fetch(`${API}/worlds:generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        display_name: `revolution/${entry.scene}`,
        model: WORLD_MODEL,
        world_prompt: worldPrompt,
      }),
    });
    if (!res.ok) throw new Error(`generate failed ${res.status}: ${await res.text()}`);
    const operation = await res.json();

    const done = await pollUntil(
      async () => {
        const poll = await fetch(`${API}/operations/${operation.operation_id}`, { headers });
        if (!poll.ok) throw new Error(`poll failed ${poll.status}`);
        const body = await poll.json();
        return body.done ? body : null;
      },
      { intervalMs: 10_000, label: `generation of ${entry.scene}` }
    );
    console.log("");
    if (done.response?.error) throw new Error(JSON.stringify(done.response.error));
    worldId = done.response?.id ?? done.metadata?.world_id;
    console.log(`world id: ${worldId}`);
    console.log(`generation signature: ${generationSignature}`);
    console.log(`viewer:   https://marble.worldlabs.ai/world/${worldId}`);
    console.log(`(paste both values into worlds.config.mjs to pin this take)`);
  }

  // Assets can publish a few moments after the operation reports done.
  const world = await pollUntil(
    async () => {
      const worldRes = await fetch(`${API}/worlds/${worldId}`, { headers });
      if (!worldRes.ok) throw new Error(`world fetch failed ${worldRes.status}`);
      const body = await worldRes.json();
      return body.assets?.splats?.spz_urls ? body : null;
    },
    { intervalMs: 15_000, timeoutMs: 20 * 60 * 1000, label: `assets of ${entry.scene}` }
  );
  const splats = world.assets.splats;
  const spzUrl = splats.spz_urls["500k"] ?? splats.spz_urls.full_res;
  if (!spzUrl) throw new Error("world has no spz asset");
  await download(spzUrl, `public/assets/worlds/${entry.scene}.spz`);

  const colliderUrl = world.assets?.mesh?.collider_mesh_url;
  const colliderPath = resolve(projectRoot, `public/assets/worlds/${entry.scene}-collider.glb`);
  if (colliderUrl) {
    await download(colliderUrl, `public/assets/worlds/${entry.scene}-collider.glb`);
  } else {
    // remove any stale collider from a previous take so the renderer really
    // does fall back to flat ground rather than raycasting the wrong world
    if (existsSync(colliderPath)) rmSync(colliderPath);
    console.log("  (no collider mesh on this world — scene falls back to flat ground)");
  }

  const meta = splats?.semantics_metadata ?? {};
  writeFileSync(
    resolve(projectRoot, `public/assets/worlds/${entry.scene}.meta.json`),
    JSON.stringify({ ...meta, worldId, generationSignature }, null, 2)
  );
  console.log(`  scale factor: ${meta.metric_scale_factor ?? "?"} · ground offset: ${meta.ground_plane_offset ?? "?"}`);
}

const selected = worlds.filter((w) => !sceneArg || w.scene === sceneArg);
if (selected.length === 0) {
  console.error(`unknown scene "${sceneArg}" — known: ${worlds.map((w) => w.scene).join(", ")}`);
  process.exit(1);
}
for (const entry of selected) {
  const already = existsSync(resolve(projectRoot, `public/assets/worlds/${entry.scene}.spz`));
  // A local asset only counts when it came from the current generation inputs;
  // prompt edits and newly pinned takes must never inherit a stale local .spz.
  let localMetadata = null;
  const metaPath = resolve(projectRoot, `public/assets/worlds/${entry.scene}.meta.json`);
  if (existsSync(metaPath)) {
    try { localMetadata = JSON.parse(readFileSync(metaPath, "utf8")); } catch { /* refetch */ }
  }
  if (already && !worldIdFlag && worldAssetCacheMatches(entry, localMetadata)) {
    console.log(`${entry.scene}: asset exists, skipping (delete the .spz to regenerate)`);
    continue;
  }
  await generateWorld(entry);
}
