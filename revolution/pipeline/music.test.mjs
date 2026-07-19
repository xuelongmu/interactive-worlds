import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATES,
  DURATION_MS,
  MUSIC_MODEL,
  OUTPUT_FORMAT,
  PERIOD_PALETTE,
  promptFor,
  requestFor,
} from "./music.candidates.mjs";
import {
  artifactPath,
  candidateSignature,
  parseArgs,
  publicMetadata,
  run,
  selectCandidates,
  sha256,
  validateCache,
} from "./music.mjs";

test("offers four distinct, reversible main-theme candidates", () => {
  assert.equal(CANDIDATES.length, 4);
  assert.equal(new Set(CANDIDATES.map(({ id }) => id)).size, CANDIDATES.length);
  for (const candidate of CANDIDATES) {
    assert.match(candidate.id, /^[a-d]-[a-z-]+$/);
    assert.ok(candidate.direction.length > 40);
    assert.ok(candidate.tradeoff.includes("but"));
    assert.equal(
      artifactPath(candidate),
      `artifacts/music-theme-candidates/takes/${candidate.id}.mp3`
    );
    assert.ok(!artifactPath(candidate).startsWith("public/"));
  }
});

test("locks every request to the period palette and instrumental title brief", () => {
  assert.deepEqual(PERIOD_PALETTE, [
    "one-key wooden fife",
    "rope-tension field drum",
    "small gut-string ensemble (two violins, viola, and cello)",
  ]);
  for (const candidate of CANDIDATES) {
    const prompt = promptFor(candidate);
    for (const instrument of PERIOD_PALETTE) assert.ok(prompt.includes(instrument));
    assert.match(prompt, /No vocals/);
    assert.match(prompt, /no battle\s+intensity/i);
    assert.match(prompt, /do not imitate or quote any existing tune/i);
    assert.ok(prompt.length <= 4_100);
    assert.deepEqual(requestFor(candidate), {
      prompt,
      music_length_ms: DURATION_MS,
      model_id: MUSIC_MODEL,
      force_instrumental: true,
      store_for_inpainting: false,
      sign_with_c2pa: true,
    });
  }
  assert.equal(MUSIC_MODEL, "music_v2");
  assert.equal(OUTPUT_FORMAT, "mp3_48000_192");
});

test("content signatures change with candidate direction", () => {
  const original = CANDIDATES[0];
  const changed = { ...original, direction: `${original.direction} More space.` };
  assert.notEqual(candidateSignature(original), candidateSignature(changed));
  assert.equal(candidateSignature(original), candidateSignature({ ...original }));
});

test("CLI parsing requires an explicit mode and rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { mode: "dry-run", requested: [] });
  assert.deepEqual(parseArgs(["--generate", "--candidate", CANDIDATES[2].id]), {
    mode: "generate",
    requested: [CANDIDATES[2].id],
  });
  assert.throws(() => parseArgs([]), /choose a mode/);
  assert.throws(() => parseArgs(["--dryrun"]), /unknown argument/);
  assert.throws(() => parseArgs(["--generate", "--candiate", CANDIDATES[0].id]), /unknown/);
  assert.throws(() => parseArgs(["--audit", "--generate"]), /exactly one mode/);
  assert.throws(() => parseArgs(["--candidate", CANDIDATES[0].id]), /choose a mode/);
});

test("candidate selection rejects unknown ids and de-duplicates ids", () => {
  assert.deepEqual(selectCandidates([]), [...CANDIDATES]);
  assert.deepEqual(
    selectCandidates([CANDIDATES[2].id, CANDIDATES[2].id]),
    [CANDIDATES[2]]
  );
  assert.throws(() => selectCandidates(["not-a-candidate"]), /unknown candidate/);
});

test("mistyped flags fail before any paid request", async () => {
  let requested = false;
  const fetchImpl = async () => {
    requested = true;
    throw new Error("must not be called");
  };
  await assert.rejects(run(["--dryrun"], fetchImpl), /unknown argument/);
  await assert.rejects(
    run(["--generate", "--candiate", CANDIDATES[0].id], fetchImpl),
    /unknown argument/
  );
  await assert.rejects(
    run(["--generate", "--candidate", "not-a-candidate"], fetchImpl),
    /unknown candidate/
  );
  assert.equal(requested, false);
});

test("metadata exposes hashes only for cache entries verified against current artifacts", () => {
  const artifacts = new Map(
    CANDIDATES.map((candidate) => [candidate.id, Buffer.from(`exact audio ${candidate.id}`)])
  );
  const cache = Object.fromEntries(
    CANDIDATES.map((candidate) => [
      candidate.id,
      {
        signature: candidateSignature(candidate),
        sha256: sha256(artifacts.get(candidate.id)),
        bytes: artifacts.get(candidate.id).byteLength,
      },
    ])
  );
  cache[CANDIDATES[0].id].signature = "stale-signature";
  artifacts.delete(CANDIDATES[1].id);
  cache[CANDIDATES[2].id].sha256 = "wrong-hash";

  const candidateForPath = (path) =>
    CANDIDATES.find((candidate) => String(path).endsWith(`${candidate.id}.mp3`));
  const validation = validateCache(cache, {
    exists: (path) => artifacts.has(candidateForPath(path)?.id),
    read: (path) => artifacts.get(candidateForPath(path)?.id),
  });
  assert.deepEqual(Object.keys(validation.valid), [CANDIDATES[3].id]);
  assert.deepEqual(
    validation.invalid.map(({ reason }) => reason),
    ["spec signature changed", "artifact missing", "artifact SHA-256 mismatch"]
  );

  const metadata = publicMetadata(validation);
  for (const candidate of metadata.candidates.slice(0, 3)) {
    assert.equal(candidate.status, "unavailable");
    assert.equal("sha256" in candidate, false);
  }
  assert.equal(metadata.candidates[3].status, "verified");
  assert.equal(metadata.candidates[3].sha256, cache[CANDIDATES[3].id].sha256);
});
