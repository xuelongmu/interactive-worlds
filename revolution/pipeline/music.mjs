/** Generate reversible main-theme candidates for the director's by-ear pick.
 *
 * Usage:
 *   node pipeline/music.mjs --dry-run
 *   node pipeline/music.mjs --audit
 *   node pipeline/music.mjs --generate [--candidate a-fife-lament]
 *
 * Outputs are intentionally ignored:
 *   artifacts/music-theme-candidates/takes/<candidate>.mp3
 *   artifacts/music-theme-candidates/takes/index.json
 *
 * This pipeline does not select a theme or wire music into runtime manifests.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATES, OUTPUT_FORMAT, requestFor } from "./music.candidates.mjs";
import { hash, loadCache, projectRoot, requireKey, saveCache } from "./lib.mjs";

export const CACHE_FILE = "pipeline/.music-candidate-cache.json";
export const OUTPUT_ROOT = "artifacts/music-theme-candidates/takes";

export function artifactPath(candidate) {
  return `${OUTPUT_ROOT}/${candidate.id}.mp3`;
}

export function candidateSignature(candidate) {
  return hash({ outputFormat: OUTPUT_FORMAT, request: requestFor(candidate) });
}

export function parseArgs(argv) {
  const requested = [];
  let mode = null;
  const setMode = (next) => {
    if (mode && mode !== next) {
      throw new Error(`choose exactly one mode; got --${mode} and --${next}`);
    }
    mode = next;
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--help", "--dry-run", "--audit", "--generate"].includes(arg)) {
      setMode(arg.slice(2));
    } else if (arg === "--candidate") {
      const id = argv[++index];
      if (!id || id.startsWith("--")) throw new Error("--candidate requires an id");
      requested.push(id);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new Error("choose a mode: --dry-run, --audit, or --generate");
  if (mode === "help" && requested.length) throw new Error("--help cannot be combined with --candidate");
  return { mode, requested };
}

export function selectCandidates(requested) {
  if (!requested.length) return [...CANDIDATES];

  const known = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`unknown candidate(s): ${unknown.join(", ")}`);
  return [...new Set(requested)].map((id) => known.get(id));
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function invalidReason(candidate, entry, io = {}) {
  const exists = io.exists ?? existsSync;
  const read = io.read ?? readFileSync;
  const expectedSignature = candidateSignature(candidate);
  const output = resolve(projectRoot, artifactPath(candidate));
  if (!entry) return "cache entry missing";
  if (entry.signature !== expectedSignature) return "spec signature changed";
  if (!entry.sha256) return "artifact SHA-256 missing";
  if (!exists(output)) return "artifact missing";
  if (sha256(read(output)) !== entry.sha256) return "artifact SHA-256 mismatch";
  return null;
}

export function validateCache(cache, io = {}) {
  const valid = {};
  const invalid = [];

  for (const candidate of CANDIDATES) {
    const entry = cache[candidate.id];
    const reason = invalidReason(candidate, entry, io);

    if (reason) invalid.push({ id: candidate.id, reason });
    else valid[candidate.id] = entry;
  }
  return { valid, invalid };
}

export function publicMetadata(validation) {
  const unavailableById = new Map(validation.invalid.map(({ id, reason }) => [id, reason]));
  return {
    purpose: "Main-theme candidates awaiting director by-ear selection",
    approvalStatus: "unselected",
    candidates: CANDIDATES.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      artifact: artifactPath(candidate),
      direction: candidate.direction,
      tradeoff: candidate.tradeoff,
      status: validation.valid[candidate.id] ? "verified" : "unavailable",
      ...(validation.valid[candidate.id] ?? {}),
      ...(unavailableById.has(candidate.id)
        ? { unavailableReason: unavailableById.get(candidate.id) }
        : {}),
    })),
  };
}

function saveMetadata(cache) {
  const validation = validateCache(cache);
  const output = resolve(projectRoot, OUTPUT_ROOT, "index.json");
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(publicMetadata(validation), null, 2));
  return validation;
}

function cachedArtifactMatches(candidate, entry) {
  return invalidReason(candidate, entry) === null;
}

async function errorDetail(response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed.detail?.message ?? parsed.detail ?? parsed.message ?? "request rejected";
  } catch {
    return raw.slice(0, 240) || "request rejected";
  }
}

export async function run(argv = process.argv.slice(2), fetchImpl = fetch) {
  const { mode, requested } = parseArgs(argv);
  if (mode === "help") {
    console.log(
      "Usage: node pipeline/music.mjs (--dry-run | --audit | --generate) [--candidate <id>]"
    );
    return;
  }
  const selected = selectCandidates(requested);

  for (const candidate of selected) {
    console.log(
      `${candidate.id.padEnd(23)} ${artifactPath(candidate)}  signature=${candidateSignature(candidate)}`
    );
    if (mode === "dry-run") console.log(`  tradeoff: ${candidate.tradeoff}`);
  }
  if (mode === "dry-run") return;

  const cache = loadCache(CACHE_FILE);
  if (mode === "audit") {
    const validation = saveMetadata(cache);
    if (validation.invalid.length) {
      throw new Error(
        `audit failed: ${validation.invalid.map(({ id, reason }) => `${id} (${reason})`).join(", ")}`
      );
    }
    console.log(`audit passed - ${Object.keys(validation.valid).length} exact artifacts verified`);
    return;
  }

  // Reaching the paid path requires the explicit, validated --generate mode.
  const key = requireKey("ELEVENLABS_API_KEY", "main-theme candidate generation");
  let generated = 0;
  let cached = 0;

  for (const candidate of selected) {
    if (cachedArtifactMatches(candidate, cache[candidate.id])) {
      cached++;
      continue;
    }

    console.log(`music ${candidate.id}...`);
    const response = await fetchImpl(
      `https://api.elevenlabs.io/v1/music?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(requestFor(candidate)),
      }
    );
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new Error(`music failed for ${candidate.id}: HTTP ${response.status} ${detail}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    const output = resolve(projectRoot, artifactPath(candidate));
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(output, audio);

    cache[candidate.id] = {
      signature: candidateSignature(candidate),
      sha256: sha256(audio),
      bytes: audio.byteLength,
      songId: response.headers.get("song-id") || undefined,
      generatedAt: new Date().toISOString(),
    };
    saveCache(CACHE_FILE, cache);
    saveMetadata(cache);
    generated++;
  }

  const validation = saveMetadata(cache);
  console.log(
    `done - ${generated} generated, ${cached} cached, ${selected.length} requested, ` +
      `${Object.keys(validation.valid).length} exact artifacts verified`
  );
}

// Comparing resolved paths is robust on Windows, where file URL drive-letter
// normalization can differ between launchers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
