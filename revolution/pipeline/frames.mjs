/** fal.ai GPT Image 2 → starting frames.
 *  Two consumers: Reactor conditioning frames (generated at Lingbot's native
 *  1664×960 so set_image needs no rescale) and Marble world-gen image prompts
 *  (wide establishing shots the world model extrapolates from).
 *
 *  Usage: node pipeline/frames.mjs [name]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, projectRoot, loadCache, saveCache, hash } from "./lib.mjs";

const CACHE_FILE = "pipeline/.frames-cache.json";
const STYLE =
  "Photorealistic, historically accurate late 18th century, cinematic natural light, " +
  "film still, no modern objects, no text, no watermark.";

export const frames = [
  {
    // Reactor conditioning frame — native Lingbot World 2 resolution
    file: "delaware.jpg", width: 1664, height: 960,
    prompt:
      "First-person view from inside a crowded wooden Durham boat crossing a wide dark river " +
      "at night, Christmas 1776. The viewer's gloved hands hold a long wooden pole at the bow. " +
      "Chunks of ice float on black water. Sleet and snow streak the air. Continental Army " +
      "soldiers wrapped in blankets huddle low in the boat behind; a boatman rows. Other boats " +
      "barely visible in the darkness. Almost no light — faint lantern glow, heavy grain. " + STYLE,
  },
  {
    // Marble image prompts — wide establishing shots at eye level
    file: "lexington.jpg", width: 2048, height: 1152,
    prompt:
      "Wide eye-level view of a New England village green at dawn, April 1775. Dew on rough " +
      "spring grass, a dirt road, low stone walls, a white meetinghouse and colonial clapboard " +
      "houses at the edges, bare elm trees, thin ground mist, cold golden sunrise light with " +
      "long shadows. Two opposing lines of soldiers stand frozen sixty yards apart: a ragged " +
      "line of colonial militiamen in civilian coats with muskets facing a long disciplined " +
      "line of British redcoat regulars. " + STYLE,
  },
  {
    file: "assembly-room.jpg", width: 2048, height: 1152,
    prompt:
      "Interior of the Pennsylvania State House assembly room, summer 1776, eye level. " +
      "Georgian paneled walls painted gray-blue, tall shuttered windows with thin blades of " +
      "light, rows of Windsor chairs and green baize-covered tables with papers, quills and " +
      "inkwells, a raised speaker's chair at the far end, dust hanging in the warm dim air. " +
      "Empty of people. " + STYLE,
  },
  {
    file: "valley-forge.jpg", width: 2048, height: 1152,
    prompt:
      "A Continental Army winter encampment at Valley Forge at dusk, December 1777. Rows of " +
      "small rough log huts with mud chinking in deep snow, smoke rising from clay chimneys, " +
      "frozen rutted paths, bare black trees, a few small campfires, stacked muskets, gray " +
      "overcast sky fading to blue dusk. Desolate and quiet, no people visible. " + STYLE,
  },
  // --- Reactor conditioning frames (native 1664×960) for the new Participant beats ---
  {
    file: "teaparty-deck.jpg", width: 1664, height: 960,
    prompt:
      "First-person view standing on the deck of an 18th century merchant ship at night, " +
      "December 1773, moored at a Boston wharf. Men loosely disguised with blankets, soot and " +
      "feathers hoist heavy wooden tea chests from an open hold with block and tackle; one chest " +
      "split open at the rail. Lantern light, cold breath, a huge silent crowd on the dark wharf " +
      "beyond, masts and rigging overhead. Very low light, heavy grain. " + STYLE,
  },
  {
    file: "trenton.jpg", width: 1664, height: 960,
    prompt:
      "First-person view marching in a column of Continental Army soldiers entering a small " +
      "colonial town at first light in a driving sleet storm, December 1776. Muskets with fixed " +
      "bayonets, breath steaming, a gun carriage ahead on the frozen rutted street, clapboard and " +
      "brick houses looming through the sleet. Gray dawn light, visibility fifty yards. " + STYLE,
  },
  {
    file: "saratoga-charge.jpg", width: 1664, height: 960,
    prompt:
      "First-person view from horseback at a gallop across an autumn battlefield in upstate " +
      "New York, 1777, the horse's mane and ears at the bottom of frame, charging Continental " +
      "soldiers alongside, musket smoke drifting across stubble fields, a log-and-earth " +
      "fortification ahead, wooded hills in fall color. Late golden afternoon light. " + STYLE,
  },
  {
    file: "yorktown-redoubt.jpg", width: 1664, height: 960,
    prompt:
      "First-person view advancing at a crouch through darkness toward an earthen redoubt " +
      "topped with sharpened wooden stakes, at night, October 1781. Continental soldiers " +
      "alongside carry muskets with fixed bayonets, distant siege cannon flashes light the low " +
      "clouds and silhouette the parapet. Nearly black, tense. " + STYLE,
  },
  // --- Marble image prompts (wide establishing shots) for the new splat worlds ---
  {
    file: "griffins-wharf.jpg", width: 2048, height: 1152,
    prompt:
      "Wide eye-level view along a Boston wharf at night, December 1773. Wet cobbles and " +
      "timber decking, coiled rope and barrels, three moored 18th century merchant ships with " +
      "furled sails against a cold night sky, lantern light in rigging, a dense crowd of " +
      "colonists standing still and silent along the wharf edge, brick warehouses behind. " +
      "Very low light, moonlight on black harbor water. " + STYLE,
  },
  {
    file: "surrender-field.jpg", width: 2048, height: 1152,
    prompt:
      "Wide eye-level view of an open Virginia field in October 1781, early afternoon. A long " +
      "dirt road runs away from the viewer between two facing lines of soldiers standing at " +
      "attention — white-coated French troops on one side, worn Continental troops on the " +
      "other — and between the lines British soldiers frozen mid-stride laying muskets onto a " +
      "growing pile. Autumn grass, split-rail fences, distant earthworks and smoke haze. " + STYLE,
  },
  {
    file: "treaty-paris.jpg", width: 2048, height: 1152,
    prompt:
      "Interior of an 18th century painter's studio in Paris, 1783, eye level. Dominating the " +
      "room, a monumental canvas on an easel: the left half richly painted with five American " +
      "diplomats in dark coats around a treaty table, the right half of the canvas completely " +
      "blank primed linen with faint chalk underdrawing. Tall north window light, scattered " +
      "pigments and brushes, a tall clock, parquet floor. " + STYLE,
  },
];

const key = requireKey("FAL_KEY", "frame generation");
const only = process.argv[2];
const cache = loadCache(CACHE_FILE);
const outDir = resolve(projectRoot, "public", "reference");
mkdirSync(outDir, { recursive: true });

for (const frame of frames) {
  if (only && !frame.file.startsWith(only)) continue;
  const signature = hash(frame);
  if (cache[frame.file] === signature) { console.log(`${frame.file}: cached`); continue; }
  console.log(`gpt-image-2 ${frame.file} (${frame.width}×${frame.height})…`);
  const res = await fetch("https://fal.run/openai/gpt-image-2", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: frame.prompt,
      image_size: { width: frame.width, height: frame.height },
      quality: "high",
      num_images: 1,
    }),
  });
  if (!res.ok) throw new Error(`fal failed for ${frame.file}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  const url = body.images?.[0]?.url;
  if (!url) throw new Error(`no image url in fal response: ${JSON.stringify(body).slice(0, 300)}`);
  const image = await fetch(url);
  if (!image.ok) throw new Error(`image download failed for ${frame.file}: ${image.status}`);
  writeFileSync(resolve(outDir, frame.file), Buffer.from(await image.arrayBuffer()));
  console.log(`  ✓ public/reference/${frame.file}`);
  cache[frame.file] = signature;
  saveCache(CACHE_FILE, cache);
}
console.log("done");
