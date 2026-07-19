#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const revolutionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(revolutionRoot, "..");
const manifestPath = resolve(revolutionRoot, "src/scenes/delaware.json");
const videoPath = resolve(
  revolutionRoot,
  "public/assets/video/delaware-crossing.mp4"
);
const manifestOnly = process.argv.includes("--manifest-only");
const jsonOutput = process.argv.includes("--json");

const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed, detail });
};

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedEvents = [
  { at: 45, name: "knox" },
  { at: 90, name: "storm" },
  { at: 180, name: "landing" },
  { at: 215, name: "column-formed" },
];
const actualEvents = (manifest.modelEvents ?? []).map(({ at, name }) => ({ at, name }));

addCheck(
  "fallback asset URL",
  manifest.assets?.fallbackVideo === "/assets/video/delaware-crossing.mp4",
  manifest.assets?.fallbackVideo ?? "missing"
);
addCheck(
  "model-event timeline",
  JSON.stringify(actualEvents) === JSON.stringify(expectedEvents),
  JSON.stringify(actualEvents)
);

for (const name of ["storm", "landing"]) {
  const event = manifest.modelEvents?.find((candidate) => candidate.name === name);
  addCheck(
    `${name} prompt hot-swap`,
    typeof event?.prompt === "string" && event.prompt.trim().length > 0,
    event?.prompt ? "present" : "missing"
  );
}

const expectedCues = new Map([
  ["DEL-031", "knox"],
  ["DEL-032", "storm"],
  ["DEL-040", "landing"],
  ["DEL-041", "column-formed"],
]);
for (const [cueId, eventName] of expectedCues) {
  const cue = manifest.cues?.find((candidate) => candidate.id === cueId);
  addCheck(
    `${cueId} cue mapping`,
    cue?.trigger?.type === "model-event" && cue.trigger.name === eventName,
    cue ? `${cue.trigger?.type}:${cue.trigger?.name}` : "missing"
  );
}

const finalCue = manifest.cues?.find((candidate) => candidate.id === "DEL-041");
addCheck("DEL-041 handoff", finalCue?.then === "scene:trenton", finalCue?.then ?? "missing");
addCheck(
  "manifest next scene",
  manifest.next?.scene === "trenton",
  manifest.next?.scene ?? "missing"
);

const ignoredRelativePath = relative(repositoryRoot, videoPath).replaceAll("\\", "/");
const ignoreResult = spawnSync(
  "git",
  ["check-ignore", "--quiet", "--", ignoredRelativePath],
  { cwd: repositoryRoot }
);
addCheck(
  "fallback remains git-ignored",
  ignoreResult.status === 0,
  ignoredRelativePath
);

const report = {
  expectedPath: videoPath,
  resolvedPath: null,
  sha256: null,
  bytes: null,
  durationSeconds: null,
  video: null,
  mediaChecksSkipped: manifestOnly,
  checks,
};

if (!manifestOnly) {
  try {
    const fileStat = await stat(videoPath);
    report.bytes = fileStat.size;
    report.resolvedPath = await realpath(videoPath);
    addCheck("fallback file exists", fileStat.isFile() && fileStat.size > 0, `${fileStat.size} bytes`);

    const hash = createHash("sha256");
    for await (const chunk of createReadStream(videoPath)) hash.update(chunk);
    report.sha256 = hash.digest("hex");

    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=format_name,duration:stream=codec_type,codec_name,width,height,avg_frame_rate",
        "-of",
        "json",
        videoPath,
      ],
      { encoding: "utf8" }
    );
    if (probe.error) throw new Error(`ffprobe unavailable: ${probe.error.message}`);
    if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr.trim()}`);

    const metadata = JSON.parse(probe.stdout);
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
    const durationSeconds = Number(metadata.format?.duration);
    report.durationSeconds = durationSeconds;
    report.video = videoStream ?? null;

    addCheck(
      "MP4 container",
      String(metadata.format?.format_name ?? "").includes("mp4"),
      metadata.format?.format_name ?? "missing"
    );
    addCheck(
      "browser-compatible H.264 video",
      videoStream?.codec_name === "h264",
      videoStream?.codec_name ?? "missing"
    );
    addCheck(
      "video dimensions",
      Number(videoStream?.width) > 0 && Number(videoStream?.height) > 0,
      `${videoStream?.width ?? 0}x${videoStream?.height ?? 0}`
    );
    addCheck(
      "covers final cue at 215s",
      Number.isFinite(durationSeconds) && durationSeconds >= 216,
      Number.isFinite(durationSeconds) ? `${durationSeconds.toFixed(3)}s` : "missing"
    );
  } catch (error) {
    addCheck("fallback media inspection", false, String(error));
  }
}

const failed = checks.filter((check) => !check.passed);

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`Delaware fallback verification\n`);
  process.stdout.write(`Expected path: ${report.expectedPath}\n`);
  if (report.resolvedPath) process.stdout.write(`Resolved path: ${report.resolvedPath}\n`);
  if (report.sha256) process.stdout.write(`SHA-256: ${report.sha256}\n`);
  if (manifestOnly) process.stdout.write("Media checks: skipped (--manifest-only)\n");
  for (const check of checks) {
    process.stdout.write(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}\n`);
  }
}

if (failed.length > 0) process.exitCode = 1;
