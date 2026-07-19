import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assetSignature,
  executeSfx,
  loadSoundPlan,
  parseCliArgs,
  selectAssets,
  validatePlan,
} from "./sfx.mjs";

const pipelineDir = dirname(fileURLToPath(import.meta.url));
const revolutionDir = resolve(pipelineDir, "..");
const repoDir = resolve(revolutionDir, "..");
const artifactManifest = JSON.parse(readFileSync(resolve(pipelineDir, "sfx-artifacts.json"), "utf8"));
const trustedCache = Object.fromEntries(
  artifactManifest.artifacts
    .filter((artifact) => artifact.source === "baseline")
    .map((artifact) => [artifact.file, artifact.promptSignature])
);
const plan = loadSoundPlan();

const tempRoots = [];
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "revolution-sfx-test-"));
  tempRoots.push(root);
  return root;
}

test.afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    assert.ok(root.startsWith(resolve(tmpdir())), `refusing to remove non-temp path: ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan, script ledger, and scene mapping have exact cue coverage", () => {
  assert.doesNotThrow(() => validatePlan(plan));
  assert.deepEqual(plan.scenes.map((scene) => scene.id), [
    "teaparty",
    "lexington",
    "declaration",
    "delaware",
    "trenton",
    "saratoga",
    "valley-forge",
    "yorktown",
    "treaty-paris",
  ]);

  const plannedCueIds = plan.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id)).sort();
  const script = readFileSync(resolve(repoDir, "docs", "narration-scripts.md"), "utf8");
  const ledgerCueIds = [...script.matchAll(/\*\*([A-Z]{3}-(?:AMB|SFX|SIL)-\d{3})\*\*/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(ledgerCueIds, plannedCueIds);

  const referenced = new Set(plan.scenes.flatMap((scene) => scene.cues.map((cue) => cue.asset).filter(Boolean)));
  assert.deepEqual([...referenced].sort(), plan.assets.map((asset) => asset.file).sort());
});

test("all 14 immutable baseline signatures match the preserved trusted cache", () => {
  const locked = plan.assets.filter((asset) => asset.lockedBaseline);
  assert.equal(locked.length, 14);
  assert.equal(Object.keys(trustedCache).length, 14);
  for (const asset of locked) assert.equal(trustedCache[asset.file], assetSignature(asset), asset.file);
});

test("artifact handoff covers the whole plan with codec, loudness, and exact hashes", () => {
  assert.equal(artifactManifest.integrationAuthorization.status, "provisional");
  assert.equal(artifactManifest.integrationAuthorization.authorizedBy, "director");
  assert.equal(artifactManifest.integrationAuthorization.earReviewPerformed, false);
  assert.equal(artifactManifest.integrationAuthorization.postMergePlaytest, "pending");
  assert.match(artifactManifest.reviewStatus, /no ear review recorded/);
  assert.equal(artifactManifest.artifacts.length, plan.assets.length);
  assert.deepEqual(
    artifactManifest.artifacts.map((artifact) => artifact.file).sort(),
    plan.assets.map((asset) => asset.file).sort()
  );
  for (const artifact of artifactManifest.artifacts) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(artifact.codec, "mp3");
    assert.equal(artifact.sampleRateHz, 44100);
    assert.equal(artifact.channels, 2);
    assert.equal(typeof artifact.integratedLufs, "number");
    assert.equal(typeof artifact.truePeakDbtp, "number");
    const asset = plan.assets.find((candidate) => candidate.file === artifact.file);
    assert.equal(artifact.durationSec, asset.seconds);
    assert.equal(artifact.promptSignature, assetSignature(asset));
  }
});

test("argument parsing is explicit and rejects invalid paid modes", () => {
  assert.throws(() => parseCliArgs([]), /one of --audit/);
  assert.throws(() => parseCliArgs(["--generate"]), /requires at least one --only/);
  assert.throws(() => parseCliArgs(["--audit", "--generate", "--only", "x"]), /exactly one mode/);
  assert.throws(() => parseCliArgs(["--audit", "--wat"]), /unknown argument/);
  assert.throws(() => parseCliArgs(["--audit", "--only"]), /--only requires/);
  assert.equal(parseCliArgs(["--generate", "--only", "LEX-SFX-001"]).mode, "generate");
});

test("invalid targets fail before credential lookup or network activity", async () => {
  let credentialReads = 0;
  let requests = 0;
  await assert.rejects(
    executeSfx(["--generate", "--only", "NOT-A-CUE"], {
      plan,
      getCredential: () => { credentialReads++; return "secret"; },
      fetch: async () => { requests++; throw new Error("network should not run"); },
    }),
    /unknown --only target/
  );
  assert.equal(credentialReads, 0);
  assert.equal(requests, 0);
});

test("audit and dry-run never read credentials or make requests", async () => {
  let credentialReads = 0;
  let requests = 0;
  const dependencies = {
    plan,
    loadCache: () => trustedCache,
    getCredential: () => { credentialReads++; return "secret"; },
    fetch: async () => { requests++; throw new Error("network should not run"); },
    log: () => {},
  };
  await executeSfx(["--audit", "--only", "LEX-SFX-001"], dependencies);
  await executeSfx(["--dry-run", "--only", "LEX-SFX-001"], dependencies);
  assert.equal(credentialReads, 0);
  assert.equal(requests, 0);
});

test("locked baseline media can never be regenerated", async () => {
  const root = tempRoot();
  let credentialReads = 0;
  await assert.rejects(
    executeSfx([
      "--generate", "--only", "GREEN-DAWN",
      "--asset-root", resolve(root, "audio"),
      "--cache-file", resolve(root, "cache.json"),
    ], {
      plan,
      loadCache: () => trustedCache,
      getCredential: () => { credentialReads++; return "secret"; },
      log: () => {},
    }),
    /locked baseline is not regenerable/
  );
  assert.equal(credentialReads, 0);
});

test("targeted generation persists each success before a later request fails", async () => {
  const root = tempRoot();
  const assetRoot = resolve(root, "audio");
  const cacheFile = resolve(root, "cache.json");
  writeFileSync(cacheFile, JSON.stringify(trustedCache));
  const calls = [];

  await assert.rejects(
    executeSfx([
      "--generate",
      "--only", "LEX-SFX-001",
      "--only", "TEA-SFX-002",
      "--asset-root", assetRoot,
      "--cache-file", cacheFile,
    ], {
      plan,
      getCredential: () => "paid-key",
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer };
        }
        return { ok: false, status: 503, text: async () => "temporary" };
      },
      log: () => {},
    }),
    /503 temporary/
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.elevenlabs.io/v1/sound-generation");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual([...readFileSync(resolve(assetRoot, "sfx", "lexington-first-shot.mp3"))], [1, 2, 3, 4]);
  const recovered = JSON.parse(readFileSync(cacheFile, "utf8"));
  assert.equal(recovered["amb/green-dawn.mp3"], trustedCache["amb/green-dawn.mp3"]);
  assert.equal(
    recovered["sfx/lexington-first-shot.mp3"],
    assetSignature(selectAssets(plan, ["LEX-SFX-001"])[0])
  );
  assert.equal(recovered["sfx/tea-chest-work.mp3"], undefined);
});

test("a matching output and cache record are never regenerated", async () => {
  const root = tempRoot();
  const assetRoot = resolve(root, "audio");
  const cacheFile = resolve(root, "cache.json");
  const asset = selectAssets(plan, ["LEX-SFX-001"])[0];
  const output = resolve(assetRoot, asset.file);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, Buffer.from("existing approved bytes"));
  writeFileSync(cacheFile, JSON.stringify({ ...trustedCache, [asset.file]: assetSignature(asset) }));
  let credentialReads = 0;
  let requests = 0;

  const result = await executeSfx([
    "--generate", "--only", "LEX-SFX-001",
    "--asset-root", assetRoot,
    "--cache-file", cacheFile,
  ], {
    plan,
    getCredential: () => { credentialReads++; return "secret"; },
    fetch: async () => { requests++; throw new Error("must not regenerate"); },
    log: () => {},
  });

  assert.equal(result.generated, 0);
  assert.equal(credentialReads, 0);
  assert.equal(requests, 0);
  assert.equal(readFileSync(output, "utf8"), "existing approved bytes");
});

test("audition page exposes grouped playback, stop, metadata, leakage checks, and notes", () => {
  const html = readFileSync(resolve(pipelineDir, "sfx-audition.html"), "utf8");
  for (const marker of [
    "Stop all",
    "data-action=\"play\"",
    "data-action=\"approve\"",
    "data-action=\"reject\"",
    "No voice/speech leakage heard",
    "No music/score leakage heard",
    "No musket/gunshot heard",
    "localStorage",
    "Export notes",
  ]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

