/** Ambience beds + event SFX via ElevenLabs sound generation.
 *  Usage: node pipeline/sfx.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, projectRoot, loadCache, saveCache, hash } from "./lib.mjs";

const CACHE_FILE = "pipeline/.sfx-cache.json";

const sounds = [
  { file: "amb/green-dawn.mp3", seconds: 22,
    prompt: "Quiet New England village green at dawn: birdsong, light wind through spring grass, a dog barking far away, a distant military drum. No music, no voices." },
  { file: "amb/assembly-room.mp3", seconds: 22,
    prompt: "Quiet 18th century interior room tone: muffled street sounds through shuttered windows, occasional flies buzzing, a wooden chair creak, a single quill scratching on paper. No music, no voices." },
  { file: "amb/river-ice-storm.mp3", seconds: 22,
    prompt: "Night river crossing in a winter storm: wind and driving sleet, chunks of ice grinding and knocking against a wooden hull, oars creaking in oarlocks, water lapping. No music, no voices." },
  { file: "sfx/musket-volley.mp3", seconds: 8,
    prompt: "A ragged volley of 18th century flintlock muskets: one sharp shot first, then dozens firing raggedly, echo across an open field, distant screams and a drum. No music." },
];

const key = requireKey("ELEVENLABS_API_KEY", "SFX generation");
const cache = loadCache(CACHE_FILE);
let generated = 0;

for (const sound of sounds) {
  const signature = hash(sound);
  if (cache[sound.file] === signature) continue;
  console.log(`sfx ${sound.file}…`);
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: sound.prompt,
      duration_seconds: sound.seconds,
      prompt_influence: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`sfx failed for ${sound.file}: ${res.status} ${await res.text()}`);
  const outPath = resolve(projectRoot, "public", "assets", "audio", sound.file);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  cache[sound.file] = signature;
  generated++;
}
saveCache(CACHE_FILE, cache);
console.log(`done — ${generated} generated, ${sounds.length - generated} cached`);
