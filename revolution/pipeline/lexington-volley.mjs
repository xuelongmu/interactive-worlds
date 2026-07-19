#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./lib.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const absolute = (path) => isAbsolute(path) ? path : resolve(projectRoot, path);
const relativeDisplay = (path) => path.startsWith(projectRoot) ? path.slice(projectRoot.length + 1) : path;

const framePath = absolute(option("--frame", "snapshots/lexington-trigger-frame.jpg"));
const sourcePath = absolute(option("--source", "public/assets/video/lexington-volley-source.mp4"));
const outputPath = absolute(option("--output", "public/assets/video/lexington-volley.mp4"));
const volleyPath = resolve(projectRoot, "public/assets/audio/sfx/musket-volley.mp3");
const ambiencePath = resolve(projectRoot, "public/assets/audio/amb/green-dawn.mp3");
const configPath = resolve(projectRoot, "pipeline/lexington-volley.edit.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

if (sourcePath.toLowerCase() === outputPath.toLowerCase()) {
  throw new Error("--source and --output must be different paths; raw takes are never overwritten");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function command(name, commandArgs) {
  const result = spawnSync(name, commandArgs, { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${name} failed (${result.status}):\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function probe(path) {
  return JSON.parse(command("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels",
    "-of", "json",
    path,
  ]));
}

function printCheck(path, label) {
  if (!existsSync(path)) {
    console.log(`missing  ${label}: ${relativeDisplay(path)}`);
    return false;
  }
  console.log(`ready    ${label}: ${relativeDisplay(path)} (${statSync(path).size} bytes, sha256 ${sha256(path)})`);
  return true;
}

const readiness = [
  printCheck(framePath, "trigger frame"),
  printCheck(sourcePath, "generated source video"),
  printCheck(volleyPath, "volley / restrained screams / drum SFX"),
  printCheck(ambiencePath, "Lexington dawn ambience"),
];

if (args.includes("--check")) {
  if (!readiness.every(Boolean)) {
    console.log("blocked  Capture the real trigger view and generate one conditioned source clip before assembly.");
  }
  process.exit(0);
}

if (!readiness.every(Boolean)) {
  throw new Error("required inputs are missing; run with --check for the exact blocked prerequisites");
}

const sourceProbe = probe(sourcePath);
const sourceVideo = sourceProbe.streams.find((stream) => stream.codec_type === "video");
const sourceDuration = Number(sourceProbe.format.duration);
if (!sourceVideo) throw new Error("generated source has no video stream");
if (!Number.isFinite(sourceDuration) || sourceDuration < 20 || sourceDuration > 30) {
  throw new Error(`generated source must be 20–30 seconds; got ${sourceProbe.format.duration}`);
}

const frameProbe = probe(framePath);
const frameVideo = frameProbe.streams.find((stream) => stream.codec_type === "video");
if (!frameVideo) throw new Error("trigger frame is not a readable image");
if (frameVideo.width !== config.output.width || frameVideo.height !== config.output.height) {
  throw new Error(
    `trigger frame must be ${config.output.width}x${config.output.height}; got ${frameVideo.width}x${frameVideo.height}`
  );
}

const duration = Math.min(config.targetDurationSeconds, sourceDuration);
const ambienceFadeStart = Math.max(0, duration - 3);
const { width, height, fps } = config.output;
const { exactFrameSeconds, blendToGeneratedSeconds } = config.matchCut;
const videoFilter = [
  `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},settb=1/${fps},trim=duration=${exactFrameSeconds + blendToGeneratedSeconds},setpts=PTS-STARTPTS[still]`,
  `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},settb=1/${fps},trim=duration=${duration},setpts=PTS-STARTPTS[motion]`,
  `[still][motion]xfade=transition=fade:duration=${blendToGeneratedSeconds}:offset=${exactFrameSeconds},trim=duration=${duration},fps=${fps},format=yuv420p[v]`,
];
const audioFilter = [
  `[2:a]adelay=${config.audio.volleyDelayMs}:all=1,volume=${config.audio.volleyGain},apad,atrim=duration=${duration}[volley]`,
  `[3:a]volume=${config.audio.ambienceGain},atrim=duration=${duration},afade=t=out:st=${ambienceFadeStart}:d=3[bed]`,
  `[bed][volley]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,atrim=duration=${duration}[a]`,
];

mkdirSync(dirname(outputPath), { recursive: true });
command("ffmpeg", [
  "-y",
  "-loop", "1", "-framerate", String(fps), "-i", framePath,
  "-i", sourcePath,
  "-i", volleyPath,
  "-stream_loop", "-1", "-i", ambiencePath,
  "-filter_complex", [...videoFilter, ...audioFilter].join(";"),
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart",
  "-map_metadata", "-1",
  "-fflags", "+bitexact",
  "-flags:v", "+bitexact",
  "-flags:a", "+bitexact",
  outputPath,
]);

const reviewPath = outputPath.replace(/\.mp4$/i, ".review.json");
const review = {
  schema: 1,
  candidate: relativeDisplay(outputPath).replaceAll("\\", "/"),
  directorStatus: "async veto pending",
  durationSeconds: duration,
  inputs: {
    triggerFrame: { path: relativeDisplay(framePath).replaceAll("\\", "/"), sha256: sha256(framePath) },
    generatedSource: { path: relativeDisplay(sourcePath).replaceAll("\\", "/"), sha256: sha256(sourcePath) },
    volleySfx: { path: relativeDisplay(volleyPath).replaceAll("\\", "/"), sha256: sha256(volleyPath) },
    ambience: { path: relativeDisplay(ambiencePath).replaceAll("\\", "/"), sha256: sha256(ambiencePath) },
    editConfig: { path: "pipeline/lexington-volley.edit.json", sha256: sha256(configPath) },
  },
  output: { sha256: sha256(outputPath), probe: probe(outputPath) },
  prompt: config.conditioningPrompt,
  prerequisites: config.prerequisites,
  audioProvenance: config.audio.provenance,
  assertions: [
    "Raw generated-video audio was discarded.",
    "No narration or music source is present in the edit graph.",
    "The exact captured trigger frame opens the cut before blending into generated motion.",
    "Production use still requires the issue #4 visible trigger-line authoring pass.",
    "Director by-eye review and async veto remain pending.",
  ],
};
writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

console.log(`wrote    ${relativeDisplay(outputPath)} (${statSync(outputPath).size} bytes, sha256 ${review.output.sha256})`);
console.log(`wrote    ${relativeDisplay(reviewPath)}`);
