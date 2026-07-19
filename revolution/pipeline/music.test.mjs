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
import { artifactPath, candidateSignature, selectCandidates } from "./music.mjs";

test("offers four distinct, reversible main-theme candidates", () => {
  assert.equal(CANDIDATES.length, 4);
  assert.equal(new Set(CANDIDATES.map(({ id }) => id)).size, CANDIDATES.length);
  for (const candidate of CANDIDATES) {
    assert.match(candidate.id, /^[a-d]-[a-z-]+$/);
    assert.ok(candidate.direction.length > 40);
    assert.ok(candidate.tradeoff.includes("but"));
    assert.equal(artifactPath(candidate), `public/assets/audio/music/candidates/${candidate.id}.mp3`);
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

test("candidate selection rejects unknown ids and de-duplicates requested ids", () => {
  assert.deepEqual(selectCandidates([]), [...CANDIDATES]);
  assert.deepEqual(
    selectCandidates(["--candidate", CANDIDATES[2].id, "--candidate", CANDIDATES[2].id]),
    [CANDIDATES[2]]
  );
  assert.throws(() => selectCandidates(["--candidate", "not-a-candidate"]), /unknown candidate/);
  assert.throws(() => selectCandidates(["--candidate"]), /requires an id/);
});
