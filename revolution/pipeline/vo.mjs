/** Narration script → ElevenLabs VO, one file per cue id.
 *  Source of truth: docs/narration-scripts.md (cue blocks like
 *  `**LEX-010 — trigger**` followed by `> NARRATOR: line`).
 *  Content-hashed: a one-line rewrite regenerates one file.
 *
 *  Usage: node pipeline/vo.mjs [--dry-run]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, projectRoot, loadCache, saveCache, hash } from "./lib.mjs";

const SCRIPT = resolve(projectRoot, "..", "docs", "narration-scripts.md");
const OUT_DIR = resolve(projectRoot, "public", "assets", "audio", "vo");
const CACHE_FILE = "pipeline/.vo-cache.json";
const MODEL_ID = "eleven_multilingual_v2";
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.15 };

const dryRun = process.argv.includes("--dry-run");

/** Parse `**CUE-ID — …**` blocks followed by `> NARRATOR: …` lines. */
function parseCues(markdown) {
  markdown = markdown.replace(/\r\n/g, "\n"); // CRLF checkouts break `.`-based line matching
  const cues = [];
  const blockRe = /\*\*([A-Z]{3}-\d{3})[^\n]*\*\*\s*\n((?:>.*\n?)*)/g;
  for (const match of markdown.matchAll(blockRe)) {
    const [, id, quoted] = match;
    const narratorLine = quoted
      .split("\n")
      .map((l) => l.replace(/^>\s?/, ""))
      .join("\n")
      .match(/NARRATOR:\s*([\s\S]*?)(?=\n[A-Z]+ ?\(|$)/);
    if (!narratorLine) continue;
    const text = narratorLine[1]
      .replace(/\[[^\]]*\]/g, " … ") // stage directions -> pause
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ id, text });
  }
  return cues;
}

const cues = parseCues(readFileSync(SCRIPT, "utf8"));
console.log(`parsed ${cues.length} narrator cues from docs/narration-scripts.md`);
if (dryRun) {
  for (const cue of cues) console.log(`  ${cue.id}: ${cue.text.slice(0, 70)}…`);
  process.exit(0);
}

const key = requireKey("ELEVENLABS_API_KEY", "VO generation");
const voiceId = requireKey("ELEVENLABS_NARRATOR_VOICE_ID", "VO generation (narrator voice)");
const cache = loadCache(CACHE_FILE);
mkdirSync(OUT_DIR, { recursive: true });

let generated = 0;
for (const cue of cues) {
  const signature = hash({ text: cue.text, voiceId, MODEL_ID, VOICE_SETTINGS });
  if (cache[cue.id] === signature) continue;
  console.log(`tts ${cue.id}…`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: cue.text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    }
  );
  if (!res.ok) throw new Error(`tts failed for ${cue.id}: ${res.status} ${await res.text()}`);
  writeFileSync(resolve(OUT_DIR, `${cue.id}.mp3`), Buffer.from(await res.arrayBuffer()));
  cache[cue.id] = signature;
  // persist after every paid call so a mid-run failure never re-bills done cues
  saveCache(CACHE_FILE, cache);
  generated++;
}
console.log(`done — ${generated} generated, ${cues.length - generated} cached`);
