import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANDIDATES,
  MODEL_ID,
  OUTPUT_FORMAT,
  ROLES,
  auditionText,
  requestFor,
  roleFor,
} from "./casting-round-two.candidates.mjs";
import {
  artifactPath,
  candidateSignature,
  ensureVoice,
  parseArgs,
  publicMetadata,
  reviewHtml,
  run,
  selectCandidates,
  sha256,
  validateCache,
} from "./casting-round-two.mjs";

test("offers three distinct, unselected candidates for each role", () => {
  assert.equal(ROLES.length, 2);
  assert.equal(CANDIDATES.length, 6);
  assert.equal(new Set(CANDIDATES.map(({ id }) => id)).size, CANDIDATES.length);
  assert.equal(new Set(CANDIDATES.map(({ voiceId }) => voiceId)).size, CANDIDATES.length);
  for (const role of ROLES) {
    assert.equal(CANDIDATES.filter(({ roleId }) => roleId === role.id).length, 3);
    assert.equal(role.lineStatus, "proposed-awaiting-director-async-veto");
  }
  const metadata = publicMetadata({ valid: {}, invalid: CANDIDATES.map(({ id }) => ({ id, reason: "test" })) });
  assert.equal(metadata.approvalStatus, "unselected");
  assert.equal(JSON.stringify(metadata).includes("selectedVoice"), false);
  assert.equal(JSON.stringify(metadata).includes("winner"), false);
});

test("uses exact v3 tags, settings, and proposed lines", () => {
  const drillmaster = ROLES.find(({ id }) => id === "drillmaster");
  const officer = ROLES.find(({ id }) => id === "officer");
  assert.equal(MODEL_ID, "eleven_v3");
  assert.equal(OUTPUT_FORMAT, "mp3_44100_128");
  assert.equal(drillmaster.tag, "[shouting]");
  assert.equal(drillmaster.lines.length, 5);
  assert.match(auditionText(drillmaster), /En avant — marche!/);
  assert.match(auditionText(drillmaster), /Quick! Make ready — again!/);
  assert.equal(officer.tag, "[whispers]");
  assert.deepEqual(officer.lines, ["No shot. Bayonets only.", "Keep low. Follow close."]);
  for (const candidate of CANDIDATES) {
    const role = roleFor(candidate);
    assert.deepEqual(requestFor(candidate), {
      text: auditionText(role),
      model_id: MODEL_ID,
      voice_settings: role.settings,
    });
    assert.ok(!artifactPath(candidate).startsWith("public/"));
  }
});

test("content signatures cover role text, voice, settings, and output format", () => {
  const candidate = CANDIDATES[0];
  assert.equal(candidateSignature(candidate), candidateSignature({ ...candidate }));
  assert.notEqual(candidateSignature(candidate), candidateSignature({ ...candidate, voiceId: "different" }));
  assert.notEqual(candidateSignature(candidate), candidateSignature({ ...candidate, roleId: "officer" }));
});

test("CLI requires an explicit safe mode and validates candidates before generation", async () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { mode: "dry-run", requested: [] });
  assert.deepEqual(parseArgs(["--generate", "--candidate", CANDIDATES[0].id]), {
    mode: "generate",
    requested: [CANDIDATES[0].id],
  });
  assert.throws(() => parseArgs([]), /choose a mode/);
  assert.throws(() => parseArgs(["--generate", "--audit"]), /exactly one mode/);
  assert.throws(() => parseArgs(["--generate", "--candiate", CANDIDATES[0].id]), /unknown/);
  assert.throws(() => selectCandidates(["not-a-candidate"]), /unknown candidate/);
  let requested = false;
  await assert.rejects(run(["--generate", "--candidate", "not-a-candidate"], async () => {
    requested = true;
    throw new Error("must not request");
  }), /unknown candidate/);
  assert.equal(requested, false);
});

test("a 400 missing-library response installs the public voice before synthesis", async () => {
  const requests = [];
  const responses = [
    new Response(JSON.stringify({ detail: { message: `A voice with ID '${CANDIDATES[0].voiceId}' was not found.` } }), { status: 400 }),
    new Response(JSON.stringify({ voice_id: CANDIDATES[0].voiceId }), { status: 200 }),
  ];
  await ensureVoice(CANDIDATES[0], "test-key", async (url, options = {}) => {
    requests.push({ url, options });
    return responses.shift();
  });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, new RegExp(`/voices/${CANDIDATES[0].voiceId}$`));
  assert.match(requests[1].url, new RegExp(`/voices/add/${CANDIDATES[0].publicOwnerId}/${CANDIDATES[0].voiceId}$`));
  assert.equal(requests[1].options.method, "POST");
});

test("audit metadata publishes only hashes verified against exact local bytes", () => {
  const artifacts = new Map(CANDIDATES.map((candidate) => [candidate.id, Buffer.from(candidate.id)]));
  const cache = Object.fromEntries(CANDIDATES.map((candidate) => [candidate.id, {
    signature: candidateSignature(candidate),
    sha256: sha256(artifacts.get(candidate.id)),
    bytes: artifacts.get(candidate.id).byteLength,
    durationSeconds: 2.5,
  }]));
  cache[CANDIDATES[0].id].signature = "stale";
  cache[CANDIDATES[1].id].durationSeconds = 0;
  cache[CANDIDATES[2].id].sha256 = "wrong";
  artifacts.delete(CANDIDATES[3].id);
  const candidateForPath = (path) => CANDIDATES.find(({ id }) => String(path).endsWith(`${id}.mp3`));
  const validation = validateCache(cache, {
    exists: (path) => artifacts.has(candidateForPath(path)?.id),
    read: (path) => artifacts.get(candidateForPath(path)?.id),
  });
  assert.deepEqual(validation.invalid.map(({ reason }) => reason), [
    "spec signature changed",
    "artifact duration missing",
    "artifact SHA-256 mismatch",
    "artifact missing",
  ]);
  const metadata = publicMetadata(validation);
  const flattened = metadata.roles.flatMap(({ candidates }) => candidates);
  for (const candidate of flattened.slice(0, 4)) assert.equal("sha256" in candidate, false);
  for (const candidate of flattened.slice(4)) assert.equal(candidate.status, "verified");
});

test("review HTML is neutral, playable, and exposes exact provenance", () => {
  const valid = Object.fromEntries(CANDIDATES.map((candidate) => [candidate.id, {
    signature: candidateSignature(candidate),
    sha256: "a".repeat(64),
    bytes: 123,
    durationSeconds: 2.5,
  }]));
  const html = reviewHtml(publicMetadata({ valid, invalid: [] }));
  assert.match(html, /Unselected · director review only/);
  assert.equal((html.match(/<audio /g) ?? []).length, 6);
  for (const candidate of CANDIDATES) {
    assert.match(html, new RegExp(candidate.voiceId));
    assert.match(html, new RegExp(`takes/${candidate.id}\\.mp3`));
  }
  assert.doesNotMatch(html, /recommended|approved voice|selected voice/i);
});

test("director selection preserves the approved exact takes and runtime handoff", () => {
  const selection = JSON.parse(readFileSync(
    new URL("../artifacts/casting-round-two/selection.json", import.meta.url),
    "utf8"
  ));
  assert.equal(selection.approvalStatus, "director-approved");
  assert.equal(
    selection.decision,
    "https://github.com/xuelongmu/interactive-worlds/issues/27#issuecomment-5017168767"
  );

  const expected = [
    ["DRILLMASTER", "drillmaster-a-blake", "/assets/audio/vo/VAL-DRILLMASTER.mp3"],
    ["OFFICER", "officer-c-callum", "/assets/audio/vo/YOR-041.officer.mp3"],
  ];
  for (const [speaker, candidateId, cdnPath] of expected) {
    const role = selection.roles.find((item) => item.speaker === speaker);
    const candidate = CANDIDATES.find(({ id }) => id === candidateId);
    const audition = JSON.parse(readFileSync(
      new URL("../artifacts/casting-round-two/manifest.json", import.meta.url),
      "utf8"
    )).roles.flatMap((item) => item.candidates).find(({ id }) => id === candidateId);
    assert.equal(role.voiceId, candidate.voiceId);
    assert.equal(role.sha256, audition.sha256);
    assert.equal(role.bytes, audition.bytes);
    assert.equal(role.durationSeconds, audition.durationSeconds);
    assert.equal(role.cdnPath, cdnPath);
    assert.match(role.provenance, /byte-for-byte.*no regeneration/i);
  }
});
