/** Narration script → ElevenLabs VO, one file per spoken line.
 *  Source of truth: docs/narration-scripts.md (cue blocks like
 *  `**LEX-010 — trigger**` followed by `> NARRATOR: line` and/or
 *  `> MARINER (diegetic): line`), plus repeatable `**Event barks**` pools.
 *  Content-hashed: a one-line rewrite regenerates one file.
 *
 *  Output naming — the engine resolves narration at vo/<CUE-ID>.mp3, so
 *  narrator files keep that exact path. Diegetic lines sit beside them:
 *    LEX-010.mp3          narrator
 *    DEL-020.mariner.mp3  diegetic line in the same cue
 *    DEL-BARK-1.mp3       repeatable event bark
 *
 *  Usage: node pipeline/vo.mjs [--dry-run] [--only <line-id>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, readEnvValue, projectRoot, loadCache, saveCache, hash } from "./lib.mjs";

const SCRIPT = resolve(projectRoot, "..", "docs", "narration-scripts.md");
const OUT_DIR = resolve(projectRoot, "public", "assets", "audio", "vo");
const CACHE_FILE = "pipeline/.vo-cache.json";
const MODEL_ID = "eleven_v3";

/** Cast. Each speaker in the script maps to a voice and a delivery.
 *  `tag` is an eleven_v3 audio tag prepended at synthesis time — direction
 *  lives here, not in the script, so the prose stays clean for subtitles.
 *  v3 snaps `stability` to 0.0 / 0.5 / 1.0 (creative / natural / robust). */
const CAST = {
  NARRATOR: {
    env: "ELEVENLABS_NARRATOR_VOICE_ID",
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15 },
    tag: "",
  },
  MARINER: {
    env: "ELEVENLABS_MARINER_VOICE_ID",
    settings: { stability: 0.5, similarity_boost: 0.75, style: 0.6 },
    tag: "[shouting over wind]",
  },
  BOSUN: {
    env: "ELEVENLABS_BOSUN_VOICE_ID",
    settings: { stability: 0.5, similarity_boost: 0.75, style: 0.6 },
    tag: "[whispers]",
  },
  SERGEANT: {
    env: "ELEVENLABS_SERGEANT_VOICE_ID",
    settings: { stability: 0.5, similarity_boost: 0.75, style: 0.6 },
    tag: "[barking an order, urgent]",
  },
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
if (onlyIndex >= 0 && (!only || only.startsWith("--"))) {
  throw new Error("--only requires an exact spoken line id, for example TEA-050.bosun");
}
const unknownArgs = args.filter((arg, index) =>
  arg !== "--dry-run" && arg !== "--only" && index !== onlyIndex + 1
);
if (unknownArgs.length) throw new Error(`unknown argument(s): ${unknownArgs.join(", ")}`);

/** Strip stage directions to a pause, collapse whitespace, drop bark quotes. */
function clean(raw) {
  return raw
    .replace(/\[[^\]]*\]/g, " … ") // stage directions -> pause
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1"); // barks are quoted in the script
}

/** Walk the script line by line, tracking the enclosing cue (or bark pool). */
function parseLines(markdown) {
  const out = [];
  let cueId = null;
  let scenePrefix = null;
  let barkPool = false;
  let barkIndex = 0;
  let current = null; // accumulates continuation lines

  const flush = () => {
    if (!current) return;
    const text = clean(current.raw);
    if (text) out.push({ ...current, text });
    current = null;
  };

  // Normalise CRLF first: JS `.` does not match \r, so a trailing \r would
  // stop the speaker pattern from anchoring.
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const cueHeader = line.match(/^\*\*([A-Z]{3})-(\d{3})[^\n]*\*\*/);
    if (cueHeader) {
      flush();
      scenePrefix = cueHeader[1];
      cueId = `${cueHeader[1]}-${cueHeader[2]}`;
      barkPool = false;
      continue;
    }
    if (/^\*\*Event barks/i.test(line)) {
      flush();
      barkPool = true;
      continue;
    }
    if (!line.startsWith(">")) {
      flush();
      // A non-quoted, non-header line ends the current block's quoted run.
      if (line.trim() && !line.startsWith("**")) barkPool = barkPool && false;
      continue;
    }

    const body = line.replace(/^>\s?/, "");
    const speakerMatch = body.match(/^([A-Z][A-Z ]*[A-Z]|[A-Z])\s*(?:\((?:diegetic)\))?\s*:\s*(.*)$/);
    if (speakerMatch) {
      flush();
      const speaker = speakerMatch[1].trim();
      if (!CAST[speaker]) {
        console.warn(`⚠ unknown speaker "${speaker}" — no voice mapped, skipping`);
        continue;
      }
      const id = barkPool
        ? `${scenePrefix}-BARK-${++barkIndex}`
        : speaker === "NARRATOR"
          ? cueId
          : `${cueId}.${speaker.toLowerCase()}`;
      if (!id) continue;
      current = { id, speaker, raw: speakerMatch[2] };
    } else if (current) {
      current.raw += ` ${body}`; // continuation of the previous speaker's line
    }
  }
  flush();
  return out;
}

const parsedLines = parseLines(readFileSync(SCRIPT, "utf8"));
const lines = only ? parsedLines.filter((line) => line.id === only) : parsedLines;
if (only && lines.length === 0) {
  throw new Error(`spoken line id not found: ${only}`);
}
const bySpeaker = lines.reduce((acc, l) => ({ ...acc, [l.speaker]: (acc[l.speaker] ?? 0) + 1 }), {});
console.log(
  `parsed ${parsedLines.length} spoken lines from docs/narration-scripts.md` +
    (only ? `; selected ${only}` : "") + " " +
    `(${Object.entries(bySpeaker).map(([s, n]) => `${s} ${n}`).join(", ")})`
);
if (dryRun) {
  for (const l of lines) console.log(`  ${l.id.padEnd(20)} ${l.speaker.padEnd(9)} ${l.text.slice(0, 60)}…`);
  process.exit(0);
}

const key = requireKey("ELEVENLABS_API_KEY", "VO generation");

// Resolve one voice per speaker actually present in the script, so an
// unrelated missing voice never blocks a run.
const voices = {};
for (const speaker of Object.keys(bySpeaker)) {
  const { env } = CAST[speaker];
  const value = speaker === "NARRATOR" ? requireKey(env, "VO generation (narrator voice)") : readEnvValue(env);
  if (!value) {
    console.log(`⚠ ${env} is not set — skipping ${bySpeaker[speaker]} ${speaker} line(s).`);
    continue;
  }
  voices[speaker] = value;
}

const cache = loadCache(CACHE_FILE);
mkdirSync(OUT_DIR, { recursive: true });

let generated = 0;
let skipped = 0;
for (const line of lines) {
  const voiceId = voices[line.speaker];
  if (!voiceId) { skipped++; continue; }
  const { settings, tag } = CAST[line.speaker];
  const text = tag ? `${tag} ${line.text}` : line.text;

  const signature = hash({ text, voiceId, MODEL_ID, settings });
  if (cache[line.id] === signature) continue;
  console.log(`tts ${line.id} (${line.speaker})…`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: settings }),
    }
  );
  if (!res.ok) throw new Error(`tts failed for ${line.id}: ${res.status} ${await res.text()}`);
  writeFileSync(resolve(OUT_DIR, `${line.id}.mp3`), Buffer.from(await res.arrayBuffer()));
  cache[line.id] = signature;
  // persist after every paid call so a mid-run failure never re-bills done lines
  saveCache(CACHE_FILE, cache);
  generated++;
}
console.log(
  `done — ${generated} generated, ${lines.length - generated - skipped} cached` +
    (skipped ? `, ${skipped} skipped (no voice configured)` : "")
);
