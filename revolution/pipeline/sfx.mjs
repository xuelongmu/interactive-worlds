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
  // --- Scene 1: Tea Party ---
  { file: "amb/wharf-night.mp3", seconds: 22,
    prompt: "A harbor wharf at night in winter: halyards tapping against wooden masts, water lapping on pilings, the low rustle of a large crowd standing nearly silent, one distant church bell. Sparse and quiet. No music, no clear voices." },
  { file: "sfx/tea-chest.mp3", seconds: 6,
    prompt: "A hatchet splitting open a large wooden tea chest: two sharp axe blows into wood, splintering planks, then a long pour of dry loose tea leaves rushing out and splashing into harbor water below. No music, no voices." },
  // --- Scene 5: Trenton ---
  { file: "amb/trenton-sleet.mp3", seconds: 22,
    prompt: "A town street in a driving sleet storm at dawn: hard sleet rattling on ice and wood, gusting wind funneled between houses, boots and iron-shod wheels crunching on frozen ruts. Cold and harsh. No music, no voices." },
  { file: "sfx/cannon-street.mp3", seconds: 8,
    prompt: "18th century field cannon firing down a narrow town street: two deep concussive cannon blasts in close succession, echo slapping off house fronts, debris and ice falling after. No music, no voices." },
  // --- Scene 6: Saratoga ---
  { file: "amb/command-tent.mp3", seconds: 22,
    prompt: "Inside a military command tent, 18th century: canvas snapping softly in wind, an oil lantern sputtering, papers shifting, distant axes chopping wood and a faraway drum. Calm and focused. No music, no voices." },
  { file: "sfx/cavalry-charge.mp3", seconds: 10,
    prompt: "A cavalry horse at full gallop through a battle: pounding hooves on turf, hard breathing, musket fire crackling in waves left and right, men shouting far off, one bugle note. No music." },
  // --- Scene 7: Valley Forge ---
  { file: "amb/valley-forge-wind.mp3", seconds: 22,
    prompt: "A snowed-in military camp at dusk: steady bitter wind over open snow, a loose wooden door knocking, one distant axe, quiet persistent coughing from inside log huts all around. Bleak and empty. No music, no clear voices." },
  // --- Scene 8: Yorktown ---
  { file: "amb/siege-camp.mp3", seconds: 22,
    prompt: "A siege encampment at night in light rain: rain on canvas tents, distant heavy siege cannon firing every few seconds with long rolling echoes, picks and shovels working soil, low wind. No music, no voices." },
  { file: "sfx/surrender-drum.mp3", seconds: 10,
    prompt: "A single military snare drum beating a slow parley signal, alone, echoing over an open field, wind underneath, boots of a marching column faint in the distance. No music, no voices." },
  // --- Scene 9: Treaty of Paris ---
  { file: "amb/paris-studio.mp3", seconds: 22,
    prompt: "An 18th century painter's studio: a tall clock ticking, a small coal fire settling, a brush working on stretched canvas, carriage wheels passing outside on cobblestones now and then. Warm, still, interior. No music, no voices." },
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
