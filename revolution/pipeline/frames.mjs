/** fal.ai GPT Image 2 → starting frames.
 *  Two consumers: Reactor conditioning frames (generated at Lingbot's native
 *  1664×960 so set_image needs no rescale) and Marble world-gen image prompts
 *  (wide establishing shots the world model extrapolates from).
 *
 *  Usage: node pipeline/frames.mjs [name]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requireKey, projectRoot, loadCache, saveCache, hash } from "./lib.mjs";
import { visualSourcesFor } from "./visual-sources.mjs";

export const CACHE_FILE = "pipeline/.frames-cache.json";
const STYLE =
  "Photorealistic, historically accurate late 18th century, cinematic natural light, " +
  "film still, no modern objects, no text, no watermark. Treat supplied archival images " +
  "as bounded evidence for material culture, architecture, terrain, and composition—not " +
  "as literal eyewitness photographs or a style to imitate.";

export const frames = [
  {
    // Reactor conditioning frame — native Lingbot World 2 resolution
    file: "delaware.jpg", width: 1664, height: 960,
    prompt:
      "First-person view low inside a broad, high-sided 40–60-foot wooden Durham freight boat crossing a wide dark river " +
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
      "long shadows. A ragged line of colonial militiamen in civilian coats with muskets faces " +
      "British regulars. Use Doolittle for site landmarks but do not invent an exact measured " +
      "gap or perfectly opposed formations. " + STYLE,
  },
  {
    file: "assembly-room.jpg", width: 2048, height: 1152,
    prompt:
      "Interior of the Pennsylvania State House assembly room, summer 1776, eye level. " +
      "Georgian paneled walls, tall windows with period shades, thirteen green baize-covered " +
      "tables in two shallow semicircular rows, Windsor chairs, papers, quills and inkwells, " +
      "the surviving cockleshell frieze and Penn crest over a modest speaker's platform. " +
      "No balustrade and no invented dais architecture. Replace the restored room's tall ornate " +
      "1779 Rising Sun chair with a plain low-backed 1770s presiding armchair; no carved sun crest. " +
      "Empty of people. " + STYLE,
  },
  {
    file: "valley-forge.jpg", width: 2048, height: 1152,
    prompt:
      "A Continental Army winter encampment at Valley Forge at dusk, December 1777. Rows of " +
      "small 14-by-16-foot rough log huts with mud chinking in patchy snow, smoke rising from clay-lined chimneys, " +
      "frozen rutted paths, bare black trees, a few small campfires, stacked muskets, gray " +
      "overcast sky fading to blue dusk. Desolate and quiet, no people visible. " + STYLE,
  },
  // --- Reactor conditioning frames (native 1664×960) for the new Participant beats ---
  {
    file: "teaparty-deck.jpg", width: 1664, height: 960,
    prompt:
      "First-person view standing on the deck of an 18th century merchant ship at night, " +
      "December 1773, moored at a Boston wharf. Organized work parties in varied loose disguises—" +
      "blankets and soot, with feathers neither uniform nor dominant—hoist heavy wooden tea chests " +
      "from an open hold with block and tackle; one chest " +
      "split open at the rail. Lantern light, cold breath, a huge silent crowd on the dark wharf " +
      "beyond, masts and rigging overhead. Very low light, heavy grain. " + STYLE,
  },
  {
    file: "trenton.jpg", width: 1664, height: 960,
    prompt:
      "First-person view marching in a column of Continental Army soldiers entering a small " +
      "colonial town at first light in a driving sleet storm, December 1776. Muskets with fixed " +
      "bayonets, breath steaming, a gun carriage ahead on the frozen rutted street, clapboard and " +
      "brick houses looming through the sleet. Follow Wiederholdt's eyewitness street network " +
      "and approach relationship without claiming an exact visibility distance. Gray dawn light. " + STYLE,
  },
  {
    file: "saratoga-charge.jpg", width: 1664, height: 960,
    prompt:
      "First-person view from horseback at a gallop across an autumn battlefield in upstate " +
      "New York, 1777, the horse's mane and ears at the bottom of frame, charging Continental " +
      "soldiers alongside, musket smoke drifting across stubble fields, a substantial log-and-earth " +
      "Breymann fortification ahead, wooded hills in fall color. Use " +
      "Trumbull only for uniform and autumn material palette, not surrender choreography. " +
      "Late golden afternoon light. " + STYLE,
  },
  {
    file: "yorktown-redoubt.jpg", width: 1664, height: 960,
    prompt:
      "First-person view advancing at a crouch through darkness toward a low earthen-and-log " +
      "redoubt protected by abatis roughly twenty-five yards outside, at night, October 1781. " +
      "No stone walls and no tall palisade. Continental soldiers " +
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
      "growing pile without throwing them. Use Trumbull for line distinction, flags, and material " +
      "palette while treating its ceremony as compressed interpretation. Autumn grass, split-rail " +
      "fences, distant earthworks and smoke haze. " + STYLE,
  },
  {
    file: "treaty-paris.jpg", width: 2048, height: 1152,
    prompt:
      "Interior of Benjamin West's London studio around 1783, eye level. The actual unfinished " +
      "American Commissioners painting is the spatial anchor: five American negotiators in varying " +
      "states of finish around a table on the left, a broad unpainted field on the right. Do not " +
      "invent a Paris definitive-treaty signing or a different monumental canvas. Tall north-window " +
      "light, pigments and brushes, a clock, parquet floor. " + STYLE,
  },
];

export function frameGenerationSignature(frame) {
  const historicalSources = visualSourcesFor(frame.file);
  return hash({ frame, historicalSources });
}

export async function generateFrames(only = process.argv[2]) {
  const key = requireKey("FAL_KEY", "frame generation");
  const cache = loadCache(CACHE_FILE);
  const outDir = resolve(projectRoot, "public", "reference");
  mkdirSync(outDir, { recursive: true });

  for (const frame of frames) {
    if (only && !frame.file.startsWith(only)) continue;
    const historicalSources = visualSourcesFor(frame.file);
    const signature = frameGenerationSignature(frame);
    if (cache[frame.file] === signature) { console.log(`${frame.file}: cached`); continue; }
    console.log(`gpt-image-2 ${frame.file} (${frame.width}×${frame.height})…`);
    const imageUrls = historicalSources.map((source) => source.imageUrl);
    const endpoint = imageUrls.length
      ? "https://fal.run/openai/gpt-image-2/edit"
      : "https://fal.run/openai/gpt-image-2";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: frame.prompt,
        image_size: { width: frame.width, height: frame.height },
        quality: "high",
        num_images: 1,
        output_format: "jpeg",
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
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
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await generateFrames();
}
