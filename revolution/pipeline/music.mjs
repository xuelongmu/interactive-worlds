/** Generate reversible main-theme candidates for the director's by-ear pick.
 *
 * Usage:
 *   node pipeline/music.mjs --dry-run
 *   node pipeline/music.mjs
 *   node pipeline/music.mjs --candidate a-fife-lament
 *
 * Outputs are intentionally ignored:
 *   public/assets/audio/music/candidates/<candidate>.mp3
 *   public/assets/audio/music/candidates/index.json
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
export const OUTPUT_ROOT = "public/assets/audio/music/candidates";

export function artifactPath(candidate) {
  return `${OUTPUT_ROOT}/${candidate.id}.mp3`;
}

export function candidateSignature(candidate) {
  return hash({ outputFormat: OUTPUT_FORMAT, request: requestFor(candidate) });
}

export function selectCandidates(argv) {
  const requested = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg !== "--candidate") continue;
    const id = argv[++index];
    if (!id || id.startsWith("--")) throw new Error("--candidate requires an id");
    requested.push(id);
  }
  if (!requested.length) return [...CANDIDATES];

  const known = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`unknown candidate(s): ${unknown.join(", ")}`);
  return [...new Set(requested)].map((id) => known.get(id));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function publicMetadata(cache) {
  return {
    purpose: "Main-theme candidates awaiting director by-ear selection",
    approvalStatus: "unselected",
    candidates: CANDIDATES.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      artifact: artifactPath(candidate),
      direction: candidate.direction,
      tradeoff: candidate.tradeoff,
      ...(cache[candidate.id] ?? {}),
    })),
  };
}

function saveMetadata(cache) {
  const output = resolve(projectRoot, OUTPUT_ROOT, "index.json");
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(publicMetadata(cache), null, 2));
}

function cachedArtifactMatches(candidate, entry) {
  if (!entry || entry.signature !== candidateSignature(candidate) || !entry.sha256) return false;
  const output = resolve(projectRoot, artifactPath(candidate));
  if (!existsSync(output)) return false;
  return sha256(readFileSync(output)) === entry.sha256;
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
  if (argv.includes("--help")) {
    console.log("Usage: node pipeline/music.mjs [--dry-run] [--candidate <id>]");
    return;
  }
  const selected = selectCandidates(argv);
  const dryRun = argv.includes("--dry-run");

  for (const candidate of selected) {
    console.log(
      `${candidate.id.padEnd(23)} ${artifactPath(candidate)}  signature=${candidateSignature(candidate)}`
    );
    if (dryRun) console.log(`  tradeoff: ${candidate.tradeoff}`);
  }
  if (dryRun) return;

  const key = requireKey("ELEVENLABS_API_KEY", "main-theme candidate generation");
  const cache = loadCache(CACHE_FILE);
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

  saveMetadata(cache);
  console.log(`done - ${generated} generated, ${cached} cached, ${selected.length} requested`);
}

// Comparing resolved paths is robust on Windows, where file URL drive-letter
// normalization can differ between launchers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
