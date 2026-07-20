/** Build the selected Ink and String take into sparse runtime music cues.
 *
 * The generated MP3s remain ignored deployment media. The committed plan and
 * selected-take hash make the editorial choices repeatable without pretending
 * the original Eleven Music generation is byte-reproducible.
 *
 *   node pipeline/music.score.mjs --build --source <approved-take.mp3>
 *   node pipeline/music.score.mjs --audit --source <approved-take.mp3>
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SELECTED_TAKE_SHA256 =
  "a9e526b4bc6745366ce25d767825caa5e5521edc3a2f98c628ee216776fdbc15";
export const SELECTED_TAKE_ID = "b-ink-and-string";
export const SELECTED_TAKE_DURATION_SECONDS = 36.024;
export const DEFAULT_SOURCE = "artifacts/music-theme-candidates/takes/b-ink-and-string.mp3";
export const OUTPUT_DIR = "public/assets/audio/music";

export const SCORE_CUES = Object.freeze([
  { id: "chapter-sting", start: 0, duration: 2.4, loudness: -19 },
  { id: "swell-declaration", start: 4.5, duration: 5, loudness: -19 },
  { id: "swell-trenton", start: 12, duration: 5, loudness: -19 },
  { id: "swell-alliance", start: 22, duration: 6, loudness: -19 },
  { id: "swell-finale", start: 29, duration: 6.5, loudness: -19 },
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export const SCORE_PLAN_SHA256 = sha256(JSON.stringify({
  selectedTake: SELECTED_TAKE_ID,
  selectedTakeSha256: SELECTED_TAKE_SHA256,
  selectedTakeDurationSeconds: SELECTED_TAKE_DURATION_SECONDS,
  cues: SCORE_CUES,
}));

export const SCORE_OUTPUT_PLAN = Object.freeze([
  { id: "main-title", file: "main-title.mp3", durationSeconds: SELECTED_TAKE_DURATION_SECONDS },
  ...SCORE_CUES.map(({ id, duration }) => ({
    id,
    file: `${id}.mp3`,
    durationSeconds: duration,
  })),
]);

export function validateScoreManifestPlan(manifest) {
  if (manifest.selectedTake !== SELECTED_TAKE_ID ||
      manifest.selectedTakeSha256 !== SELECTED_TAKE_SHA256 ||
      manifest.scorePlanSha256 !== SCORE_PLAN_SHA256) {
    throw new Error("score manifest does not match the selected take and committed score plan");
  }
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== SCORE_OUTPUT_PLAN.length) {
    throw new Error("score manifest output list does not match the committed score plan");
  }
  for (const [index, expected] of SCORE_OUTPUT_PLAN.entries()) {
    const actual = manifest.outputs[index];
    if (actual?.id !== expected.id || actual?.file !== expected.file ||
        actual?.durationSeconds !== expected.durationSeconds) {
      throw new Error(`score manifest output does not match plan: ${expected.id}`);
    }
  }
}

export function parseArgs(argv) {
  let mode = null;
  let source = DEFAULT_SOURCE;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--build" || arg === "--audit") {
      if (mode) throw new Error("choose exactly one mode: --build or --audit");
      mode = arg.slice(2);
    } else if (arg === "--source") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--source requires a path");
      source = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new Error("choose a mode: --build or --audit");
  return { mode, source };
}

export function verifySelectedTake(sourcePath) {
  if (!existsSync(sourcePath)) throw new Error(`approved take not found: ${sourcePath}`);
  const hash = sha256(readFileSync(sourcePath));
  if (hash !== SELECTED_TAKE_SHA256) {
    throw new Error(`approved take SHA-256 mismatch: expected ${SELECTED_TAKE_SHA256}, got ${hash}`);
  }
  return hash;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function probeDuration(path) {
  return Number(run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path,
  ]));
}

function renderCue(sourcePath, cue, outputPath) {
  const fadeOutStart = Math.max(0, cue.duration - 0.5);
  const filter = [
    "afade=t=in:st=0:d=0.2",
    `afade=t=out:st=${fadeOutStart}:d=0.5`,
    `loudnorm=I=${cue.loudness}:TP=-3:LRA=7`,
    "volume=-3dB",
  ].join(",");
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", String(cue.start), "-t", String(cue.duration), "-i", sourcePath,
    "-af", filter, "-ar", "48000", "-codec:a", "libmp3lame", "-b:a", "192k", outputPath,
  ]);
}

export function buildScore(source) {
  const sourcePath = resolve(projectRoot, source);
  verifySelectedTake(sourcePath);
  const outputDir = resolve(projectRoot, OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });

  const titlePath = resolve(outputDir, "main-title.mp3");
  copyFileSync(sourcePath, titlePath);
  const outputs = [{ id: "main-title", path: titlePath }];
  for (const cue of SCORE_CUES) {
    const outputPath = resolve(outputDir, `${cue.id}.mp3`);
    renderCue(sourcePath, cue, outputPath);
    outputs.push({ id: cue.id, path: outputPath });
  }

  const manifest = {
    selectedTake: SELECTED_TAKE_ID,
    selectedTakeSha256: SELECTED_TAKE_SHA256,
    scorePlanSha256: SCORE_PLAN_SHA256,
    sourceFile: basename(sourcePath),
    outputs: outputs.map(({ id, path }) => ({
      id,
      file: basename(path),
      sha256: sha256(readFileSync(path)),
      durationSeconds: Number(probeDuration(path).toFixed(3)),
    })),
  };
  writeFileSync(resolve(outputDir, "score-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function auditScore(source) {
  const sourcePath = resolve(projectRoot, source);
  verifySelectedTake(sourcePath);
  const outputDir = resolve(projectRoot, OUTPUT_DIR);
  const manifestPath = resolve(outputDir, "score-manifest.json");
  if (!existsSync(manifestPath)) throw new Error("score manifest missing; run --build first");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateScoreManifestPlan(manifest);
  for (const output of manifest.outputs) {
    const path = resolve(outputDir, output.file);
    if (!existsSync(path)) throw new Error(`score output missing: ${output.file}`);
    const hash = sha256(readFileSync(path));
    if (hash !== output.sha256) throw new Error(`score output hash mismatch: ${output.file}`);
  }
  return manifest;
}

export function main(argv) {
  const options = parseArgs(argv);
  const manifest = options.mode === "build"
    ? buildScore(options.source)
    : auditScore(options.source);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
