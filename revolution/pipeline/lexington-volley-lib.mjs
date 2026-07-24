export const APPROVED_FIRST_SHOT_SHA256 = "bd577ba5e6a32c8e65105bd4ea318921de7a823f573c225a36a75bc28a9d5b21";
export const TRUSTED_VOLLEY_SHA256 = "b5b74d6f3dcdfe3d02648ff9f86cc788105203acc2c40462e20e28f48bc49eae";
export const MINIMUM_AFTERMATH_MS = 4_000;

/**
 * Build the cutscene-owned audio sequence without introducing director cue
 * timing. The existing edit lead-in is applied to the isolated report;
 * subsequent stages derive only from the probed media durations.
 */
export function buildAudioStages({
  cutsceneDurationSeconds,
  isolatedShotDurationSeconds,
  volleyDurationSeconds,
  leadInMs,
}) {
  const values = {
    cutsceneDurationSeconds,
    isolatedShotDurationSeconds,
    volleyDurationSeconds,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive finite number; got ${value}`);
    }
  }
  if (!Number.isInteger(leadInMs) || leadInMs < 0) {
    throw new Error(`leadInMs must be a non-negative integer; got ${leadInMs}`);
  }

  const isolatedStartMs = leadInMs;
  const isolatedEndMs = isolatedStartMs + Math.round(isolatedShotDurationSeconds * 1_000);
  const volleyStartMs = isolatedEndMs;
  const volleyEndMs = volleyStartMs + Math.round(volleyDurationSeconds * 1_000);
  const cutsceneEndMs = Math.round(cutsceneDurationSeconds * 1_000);
  const aftermathDurationMs = cutsceneEndMs - volleyEndMs;

  if (aftermathDurationMs < MINIMUM_AFTERMATH_MS) {
    throw new Error(
      `audio stages leave ${(aftermathDurationMs / 1_000).toFixed(3)}s of aftermath; ` +
      `at least ${(MINIMUM_AFTERMATH_MS / 1_000).toFixed(3)}s is required`
    );
  }

  return {
    isolatedShot: {
      cue: "LEX-SFX-001",
      startMs: isolatedStartMs,
      endMs: isolatedEndMs,
      durationMs: isolatedEndMs - isolatedStartMs,
    },
    volley: {
      cue: "LEX-SFX-002",
      startMs: volleyStartMs,
      endMs: volleyEndMs,
      durationMs: volleyEndMs - volleyStartMs,
    },
    aftermath: {
      kind: "authored-silence",
      startMs: volleyEndMs,
      endMs: cutsceneEndMs,
      durationMs: aftermathDurationMs,
    },
  };
}

export function reviewCheckpoints(stages, cutsceneDurationSeconds) {
  const cutsceneEndMs = Math.round(cutsceneDurationSeconds * 1_000);
  return [
    { id: "match-cut", atMs: 0 },
    {
      id: "isolated-shot-report",
      atMs: Math.round((stages.isolatedShot.startMs + stages.isolatedShot.endMs) / 2),
    },
    { id: "volley-begins", atMs: Math.min(stages.volley.startMs + 750, stages.volley.endMs - 1) },
    { id: "aftermath-begins", atMs: Math.min(stages.aftermath.startMs + 500, cutsceneEndMs - 1) },
    { id: "aftermath-hold", atMs: Math.max(stages.aftermath.startMs, cutsceneEndMs - 500) },
  ];
}
