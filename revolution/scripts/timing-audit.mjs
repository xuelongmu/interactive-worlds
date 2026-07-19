import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERCEIVED_TIMING_POLICY, requiredVoiceGapMs } from "../src/timing/policy.ts";
import { summarizeTimingSamples } from "../src/timing/telemetry.ts";

const CLOCK_CLASSIFICATIONS = new Map(Object.entries({
  "delaware:DEL-041:orTimer": ["active-reactor", "crossing remains playable until column formation"],
  "lexington:LEX-060:orTimer": ["player-exploration", "viewer crosses the green toward the trigger line"],
  "lexington:LEX-090:orTimer": ["player-exploration", "viewer resumes walking through the aftermath"],
  "saratoga:SAR-021:orTimer": ["player-exploration", "sand-table placement is awaiting player input"],
  "teaparty:TEA-040:orTimer": ["player-exploration", "viewer approaches and boards the ship"],
  "teaparty:TEA-070:orTimer": ["active-reactor", "chest work remains an active model sequence"],
  "teaparty:TEA-080:orTimer": ["active-reactor", "deck clearing remains an active model sequence"],
  "treaty-paris:PAR-040:orTimer": ["player-exploration", "viewer walks through the unfinished room"],
  "trenton:TRE-050:seconds": ["active-reactor", "absolute scripted sequence clock after surrender"],
  "valley-forge:VAL-040:orTimer": ["player-exploration", "viewer walks from the huts to the parade ground"],
  "valley-forge:VAL-060:orTimer": ["player-exploration", "viewer crosses the camp to its far edge"],
  "yorktown:YOR-021:orTimer": ["player-exploration", "sand-table placement is awaiting player input"],
  "yorktown:YOR-060:orTimer": ["active-reactor", "night assault remains an active model sequence"],
  "yorktown:YOR-080:orTimer": ["player-exploration", "viewer crosses the surrender field"],
}));

export function loadSceneManifests(sceneDirectory) {
  return fs.readdirSync(sceneDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      file: name,
      manifest: JSON.parse(fs.readFileSync(path.join(sceneDirectory, name), "utf8")),
    }));
}

function voicePath(publicDirectory, cue) {
  const relative = cue.vo ?? `/assets/audio/vo/${cue.id}.mp3`;
  return path.join(publicDirectory, relative.replace(/^\/?assets\//, "assets/"));
}

/** The shipped VO is constant-bit-rate MPEG audio. Reading its first frame is
 * enough for a deterministic upper-bound audit without adding a media parser
 * dependency or invoking ffprobe in CI. */
export function readCbrMp3DurationSeconds(filePath) {
  const data = fs.readFileSync(filePath);
  let offset = 0;
  if (data.toString("ascii", 0, 3) === "ID3" && data.length >= 10) {
    const size = ((data[6] & 0x7f) << 21)
      | ((data[7] & 0x7f) << 14)
      | ((data[8] & 0x7f) << 7)
      | (data[9] & 0x7f);
    offset = 10 + size;
  }

  const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  let bitrateKbps = 0;
  for (let index = offset; index + 4 <= data.length; index += 1) {
    if (data[index] !== 0xff || (data[index + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (data[index + 1] >> 3) & 0x03;
    const layerBits = (data[index + 1] >> 1) & 0x03;
    const bitrateIndex = (data[index + 2] >> 4) & 0x0f;
    if (versionBits === 0x03 && layerBits === 0x01 && bitrateIndex > 0 && bitrateIndex < 15) {
      bitrateKbps = mpeg1Layer3Bitrates[bitrateIndex] ?? 0;
      offset = index;
      break;
    }
  }
  if (!bitrateKbps) throw new Error(`cannot read MPEG-1 Layer III bitrate: ${filePath}`);

  const id3v1Bytes = data.length >= 128 && data.toString("ascii", data.length - 128, data.length - 125) === "TAG"
    ? 128
    : 0;
  return ((data.length - offset - id3v1Bytes) * 8) / (bitrateKbps * 1_000);
}

function timingSample({ id, sceneId, from, to, gapMs, activity }) {
  return { id, sceneId, from, to, gapMs, ...(activity ? { activity } : {}) };
}

export function auditSceneTiming({ sceneDirectory, publicDirectory }) {
  const sceneFiles = loadSceneManifests(sceneDirectory);
  const samples = [];
  const postCueFallbacks = [];
  const directEventHandoffs = [];
  const authoredThenHandoffs = [];
  const voiceBoundaries = [];
  const activityClocks = [];
  const unclassifiedClocks = [];
  const structuralFailures = [];
  const modelEventClocks = [];

  for (const { file, manifest } of sceneFiles) {
    if (!manifest.cues?.length) {
      structuralFailures.push(`${file}: no cues`);
      continue;
    }

    const cueIds = new Set(manifest.cues.map((cue) => cue.id));
    if (cueIds.size !== manifest.cues.length) structuralFailures.push(`${file}: duplicate cue id`);
    for (const [cueIndex, cue] of manifest.cues.entries()) {
      const trigger = cue.trigger ?? {};
      if (cue.diegeticVo && cue.subtitle) {
        const sample = timingSample({
          id: `${manifest.id}:${cue.id}:diegetic-to-narrator`,
          sceneId: manifest.id,
          from: "voice-complete",
          to: "audible-beat",
          gapMs: requiredVoiceGapMs({ previous: "diegetic", next: "narrator" }),
        });
        voiceBoundaries.push(sample);
        samples.push(sample);
      }
      const previousCue = manifest.cues[cueIndex - 1];
      if (previousCue?.subtitle && cue.subtitle) {
        const sample = timingSample({
          id: `${manifest.id}:${previousCue.id}:${cue.id}:narrator-boundary`,
          sceneId: manifest.id,
          from: "voice-complete",
          to: "audible-beat",
          gapMs: requiredVoiceGapMs({
            previous: previousCue.diegetic ? "diegetic" : "narrator",
            next: cue.diegetic ? "diegetic" : "narrator",
            interrupted: cue.interruption === true,
          }),
        });
        voiceBoundaries.push(sample);
        samples.push(sample);
      }
      const eventCompletion = ["action", "model-event", "zone-enter", "dwell"].includes(trigger.type);
      if (eventCompletion) {
        const gapMs = (trigger.afterEventSeconds ?? 0) * 1_000;
        const sample = timingSample({
          id: `${manifest.id}:${cue.id}:event-to-cue`,
          sceneId: manifest.id,
          from: trigger.type === "model-event" ? "reactor-beat-complete" : "interaction-complete",
          to: cue.subtitle ? "audible-beat" : "visible-beat",
          gapMs,
        });
        directEventHandoffs.push(sample);
        samples.push(sample);
        if (!cue.subtitle && !cue.then) {
          structuralFailures.push(`${file}:${cue.id} event completion has no audible or visible beat`);
        }
      }

      if (typeof trigger.orAfterPrevious === "number") {
        const sample = timingSample({
          id: `${manifest.id}:${cue.id}:post-cue-fallback`,
          sceneId: manifest.id,
          from: "voice-complete",
          to: "audible-beat",
          gapMs: trigger.orAfterPrevious * 1_000,
        });
        postCueFallbacks.push(sample);
        samples.push(sample);
      }

      if (cue.then) {
        const sample = timingSample({
          id: `${manifest.id}:${cue.id}:authored-then`,
          sceneId: manifest.id,
          from: "voice-complete",
          to: "visible-beat",
          gapMs: 0,
        });
        authoredThenHandoffs.push({ ...sample, then: cue.then });
        samples.push(sample);
      }

      for (const field of ["seconds", "orTimer"]) {
        const seconds = trigger[field];
        if (typeof seconds !== "number" || seconds <= 10) continue;
        const clockId = `${manifest.id}:${cue.id}:${field}`;
        const classification = CLOCK_CLASSIFICATIONS.get(clockId);
        if (!classification) {
          unclassifiedClocks.push({ id: clockId, seconds });
          continue;
        }
        const [kind, reason] = classification;
        const sample = timingSample({
          id: clockId,
          sceneId: manifest.id,
          from: "scene-start",
          to: "audible-beat",
          gapMs: seconds * 1_000,
          activity: { kind, reason },
        });
        activityClocks.push(sample);
        samples.push(sample);
      }
    }

    const lastCue = manifest.cues.at(-1);
    if (!lastCue?.then) structuralFailures.push(`${file}:${lastCue?.id ?? "<missing>"} has no terminal handoff`);

    for (const event of manifest.modelEvents ?? []) {
      modelEventClocks.push({ sceneId: manifest.id, name: event.name, atSeconds: event.at });
      if (!manifest.cues.some((cue) => cue.trigger?.type === "model-event" && cue.trigger.name === event.name)) {
        structuralFailures.push(`${file}: model event ${event.name} has no cue handoff`);
      }
    }

    for (const cue of manifest.cues) {
      if (cue.then?.startsWith("scene:") && !manifest.next?.scene) {
        structuralFailures.push(`${file}:${cue.id} advances without manifest.next`);
      }
    }
  }

  const teaParty = sceneFiles.find(({ manifest }) => manifest.id === "teaparty")?.manifest;
  const teaChestsDone = teaParty?.modelEvents?.find((event) => event.name === "chests-done")?.at;
  const teaDeckClear = teaParty?.modelEvents?.find((event) => event.name === "deck-clear")?.at;
  const expectedTeaTailSeconds = (
    PERCEIVED_TIMING_POLICY.teaPartyCompletionTakeMs
    + PERCEIVED_TIMING_POLICY.eventBusFadeMs
  ) / 1_000;
  if (teaDeckClear - teaChestsDone !== expectedTeaTailSeconds) {
    structuralFailures.push(
      `teaparty: deck-clear must follow chests-done by ${expectedTeaTailSeconds}s`,
    );
  }
  const teaCompletionCue = teaParty?.cues?.find((cue) => cue.id === "TEA-070");
  const teaParliamentCue = teaParty?.cues?.find((cue) => cue.id === "TEA-080");
  if (teaCompletionCue && teaParliamentCue) {
    const completionVoiceSeconds = readCbrMp3DurationSeconds(voicePath(publicDirectory, teaCompletionCue));
    const fallbackSeconds = teaParliamentCue.trigger?.orAfterPrevious ?? Number.POSITIVE_INFINITY;
    if (completionVoiceSeconds + fallbackSeconds < expectedTeaTailSeconds) {
      structuralFailures.push("teaparty: Parliament fallback can cut off the completion take/fade tail");
    }
  }

  const lexington = sceneFiles.find(({ manifest }) => manifest.id === "lexington")?.manifest;
  const lexingtonPostVolley = lexington?.cues?.find((cue) => cue.id === "LEX-080");
  if (lexingtonPostVolley?.trigger?.afterEventSeconds !== 4) {
    structuralFailures.push("lexington: LEX-080 must preserve the authored 4s post-volley silence");
  }

  const trenton = sceneFiles.find(({ manifest }) => manifest.id === "trenton")?.manifest;
  const surrenderAt = trenton?.modelEvents?.find((event) => event.name === "surrender")?.at;
  const surrenderCue = trenton?.cues?.find((cue) => cue.id === "TRE-040");
  const aftermathCue = trenton?.cues?.find((cue) => cue.id === "TRE-050");
  if (surrenderAt !== undefined && surrenderCue && aftermathCue?.trigger?.seconds !== undefined) {
    const duration = readCbrMp3DurationSeconds(voicePath(publicDirectory, surrenderCue));
    const gapSeconds = Math.max(0, aftermathCue.trigger.seconds - surrenderAt - duration);
    samples.push(timingSample({
      id: "trenton:TRE-040:TRE-050:scheduled-post-voice",
      sceneId: "trenton",
      from: "voice-complete",
      to: "audible-beat",
      gapMs: gapSeconds * 1_000,
    }));
  }

  const summary = summarizeTimingSamples(samples);
  return {
    sceneFiles,
    samples,
    summary,
    postCueFallbacks,
    directEventHandoffs,
    authoredThenHandoffs,
    voiceBoundaries,
    activityClocks,
    modelEventClocks,
    unclassifiedClocks,
    structuralFailures,
    ok: summary.violations.length === 0
      && unclassifiedClocks.length === 0
      && structuralFailures.length === 0,
  };
}

function seconds(ms) {
  return `${(ms / 1_000).toFixed(ms % 1_000 === 0 ? 0 : 2)}s`;
}

export function formatTimingAudit(result) {
  const fallbackGaps = result.postCueFallbacks.map((sample) => sample.gapMs);
  const minimumFallback = fallbackGaps.length ? Math.min(...fallbackGaps) : null;
  const maximumFallback = fallbackGaps.length ? Math.max(...fallbackGaps) : null;
  const lines = [
    "Perceived timing audit",
    `Scenes: ${result.sceneFiles.length}`,
    `Voice spacing: narrator->narrator ${seconds(PERCEIVED_TIMING_POLICY.narratorToNarratorMs)}; diegetic->narrator ${seconds(PERCEIVED_TIMING_POLICY.diegeticToNarratorMs)}`,
    `Post-cue fallbacks: ${result.postCueFallbacks.length}; min ${seconds(minimumFallback)}; max ${seconds(maximumFallback)}`,
    `Completed interaction/Reactor handoffs: ${result.directEventHandoffs.length}`,
    `Completed voice -> authored visible handoffs: ${result.authoredThenHandoffs.length}`,
    `Audited voice boundaries: ${result.voiceBoundaries.length}`,
    `Exploration/active-Reactor clocks (reported, excluded from dead air): ${result.activityClocks.length}`,
    `Active Reactor model-event clocks (reported, excluded from dead air): ${result.modelEventClocks.length}`,
    `Measured min/max: ${seconds(result.summary.minimumGapMs)} / ${seconds(result.summary.maximumGapMs)}`,
    `Approved >10s silence exceptions: ${result.summary.approvedExceptionCount}`,
    "",
    "Final and intermediate runtime handoffs:",
    ...result.directEventHandoffs.map((sample) => `  ${sample.id}: ${seconds(sample.gapMs)}`),
    ...result.authoredThenHandoffs.map((sample) => `  ${sample.id} -> ${sample.then}: ${seconds(sample.gapMs)}`),
    ...result.voiceBoundaries.map((sample) => `  ${sample.id}: ${seconds(sample.gapMs)}`),
    ...result.postCueFallbacks.map((sample) => `  ${sample.id}: ${seconds(sample.gapMs)}`),
    "",
    "Excluded playable/model clocks:",
    ...result.activityClocks.map((sample) => `  ${sample.id}: ${seconds(sample.gapMs)} (${sample.activity.reason})`),
    "",
    "Active Reactor beat clocks:",
    ...result.modelEventClocks.map((event) => `  ${event.sceneId}:${event.name}: ${event.atSeconds}s from active sequence start`),
  ];

  for (const failure of result.structuralFailures) lines.push(`FAIL structural: ${failure}`);
  for (const clock of result.unclassifiedClocks) lines.push(`FAIL unclassified clock: ${clock.id} ${clock.seconds}s`);
  for (const violation of result.summary.violations) lines.push(`FAIL dead air: ${violation.id} ${seconds(violation.gapMs)}`);
  lines.push(result.ok ? "PASS: no unapproved perceived dead-air path exceeds 10s" : "FAIL: timing audit rejected");
  return lines.join("\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  const revolutionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditSceneTiming({
    sceneDirectory: path.join(revolutionRoot, "src", "scenes"),
    publicDirectory: path.join(revolutionRoot, "public"),
  });
  console.log(formatTimingAudit(result));
  if (!result.ok) process.exitCode = 1;
}
