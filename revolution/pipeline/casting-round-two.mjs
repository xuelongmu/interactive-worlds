/** Generate and audit reversible issue #27 voice auditions.
 *
 * Usage:
 *   node pipeline/casting-round-two.mjs --dry-run
 *   node pipeline/casting-round-two.mjs --generate [--candidate <id>]
 *   node pipeline/casting-round-two.mjs --audit
 *
 * Generated MP3s remain outside runtime assets. This pipeline never selects a
 * winner, edits the runtime CAST, or wires scene manifests.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATES,
  ISSUE_URL,
  MODEL_ID,
  OUTPUT_FORMAT,
  ROLES,
  auditionText,
  requestFor,
  roleFor,
} from "./casting-round-two.candidates.mjs";
import { hash, loadCache, projectRoot, requireKey, saveCache } from "./lib.mjs";

export const CACHE_FILE = "pipeline/.casting-round-two-cache.json";
export const OUTPUT_ROOT = "artifacts/casting-round-two";
export const TAKES_ROOT = `${OUTPUT_ROOT}/takes`;

export function artifactPath(candidate) {
  return `${TAKES_ROOT}/${candidate.id}.mp3`;
}

export function candidateSignature(candidate) {
  return hash({
    outputFormat: OUTPUT_FORMAT,
    voiceId: candidate.voiceId,
    request: requestFor(candidate),
  });
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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
  if (mode === "help" && requested.length) {
    throw new Error("--help cannot be combined with --candidate");
  }
  return { mode, requested };
}

export function selectCandidates(requested) {
  if (!requested.length) return [...CANDIDATES];
  const known = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));
  const unknown = requested.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`unknown candidate(s): ${unknown.join(", ")}`);
  return [...new Set(requested)].map((id) => known.get(id));
}

function probeDuration(path) {
  const value = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8" }
  ).trim();
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`invalid duration for ${path}`);
  return Number(seconds.toFixed(3));
}

function invalidReason(candidate, entry, io = {}) {
  const exists = io.exists ?? existsSync;
  const read = io.read ?? readFileSync;
  const expectedSignature = candidateSignature(candidate);
  const output = resolve(projectRoot, artifactPath(candidate));
  if (!entry) return "cache entry missing";
  if (entry.signature !== expectedSignature) return "spec signature changed";
  if (!entry.sha256) return "artifact SHA-256 missing";
  if (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0) {
    return "artifact duration missing";
  }
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
    purpose: "Casting-round-two auditions awaiting director by-ear selection",
    issue: ISSUE_URL,
    approvalStatus: "unselected",
    lineStatus: "proposed-awaiting-director-async-veto",
    modelId: MODEL_ID,
    outputFormat: OUTPUT_FORMAT,
    roles: ROLES.map((role) => ({
      id: role.id,
      speaker: role.speaker,
      scene: role.scene,
      tag: role.tag,
      settings: role.settings,
      lines: role.lines,
      context: role.context,
      reviewCriterion: role.reviewCriterion,
      candidates: CANDIDATES.filter(({ roleId }) => roleId === role.id).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        voiceId: candidate.voiceId,
        sourceName: candidate.sourceName,
        publicOwnerId: candidate.publicOwnerId,
        libraryMetadata: candidate.libraryMetadata,
        tradeoff: candidate.tradeoff,
        artifact: artifactPath(candidate),
        specSignature: candidateSignature(candidate),
        status: validation.valid[candidate.id] ? "verified" : "unavailable",
        ...(validation.valid[candidate.id] ?? {}),
        ...(unavailableById.has(candidate.id)
          ? { unavailableReason: unavailableById.get(candidate.id) }
          : {}),
      })),
    })),
  };
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function reviewHtml(metadata) {
  const roleSections = metadata.roles.map((role) => {
    const settings = JSON.stringify(role.settings);
    const lines = role.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
    const cards = role.candidates.map((candidate) => {
      const audio = candidate.status === "verified"
        ? `<audio controls preload="metadata" src="./takes/${escapeHtml(candidate.id)}.mp3"></audio>`
        : `<p class="missing">Audio unavailable: ${escapeHtml(candidate.unavailableReason)}</p>`;
      const integrity = candidate.status === "verified"
        ? `<dt>SHA-256</dt><dd><code>${escapeHtml(candidate.sha256)}</code></dd>
           <dt>Media</dt><dd>${escapeHtml(candidate.durationSeconds)} seconds · ${escapeHtml(candidate.bytes)} bytes</dd>`
        : "";
      return `<article class="candidate">
        <h3>${escapeHtml(candidate.label)}</h3>
        ${audio}
        <dl>
          <dt>Voice</dt><dd>${escapeHtml(candidate.sourceName)}</dd>
          <dt>Voice ID</dt><dd><code>${escapeHtml(candidate.voiceId)}</code></dd>
          <dt>Library metadata</dt><dd>${escapeHtml(candidate.libraryMetadata)}</dd>
          <dt>Spec signature</dt><dd><code>${escapeHtml(candidate.specSignature)}</code></dd>
          ${integrity}
        </dl>
        <p><strong>Tradeoff:</strong> ${escapeHtml(candidate.tradeoff)}</p>
      </article>`;
    }).join("");
    return `<section>
      <header class="role-header">
        <p class="eyebrow">${escapeHtml(role.scene)}</p>
        <h2>${escapeHtml(role.speaker)}</h2>
        <p>${escapeHtml(role.context)}</p>
        <p><strong>Review for:</strong> ${escapeHtml(role.reviewCriterion)}</p>
        <details>
          <summary>Exact request direction and proposed lines</summary>
          <p>Audio tag: <code>${escapeHtml(role.tag)}</code></p>
          <p>Voice settings: <code>${escapeHtml(settings)}</code></p>
          <ol>${lines}</ol>
        </details>
      </header>
      <div class="grid">${cards}</div>
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>American Revolution · Casting Round Two</title>
  <style>
    :root { color-scheme: dark; --ink:#ece7da; --muted:#b9b09d; --paper:#171714; --card:#24231f; --rule:#555044; --accent:#d6ad67; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 Georgia,serif; }
    main { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:48px 0 72px; }
    h1,h2,h3 { line-height:1.1; font-weight:500; }
    h1 { font-size:clamp(2rem,5vw,4.5rem); max-width:12ch; margin:.2em 0; }
    h2 { font-size:2.2rem; margin:.1em 0; }
    h3 { font-size:1.35rem; margin-top:0; }
    .status,.eyebrow { color:var(--accent); font:700 .76rem/1.3 system-ui,sans-serif; letter-spacing:.14em; text-transform:uppercase; }
    .lede { max-width:72ch; color:var(--muted); font-size:1.08rem; }
    section { border-top:1px solid var(--rule); margin-top:48px; padding-top:32px; }
    .role-header { max-width:850px; }
    details { background:#1d1c19; border:1px solid var(--rule); border-radius:8px; padding:12px 16px; }
    summary { cursor:pointer; font-weight:700; }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin-top:24px; }
    .candidate { background:var(--card); border:1px solid var(--rule); border-radius:10px; padding:20px; }
    audio { width:100%; margin:4px 0 14px; }
    dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 12px; margin:12px 0; }
    dt { color:var(--muted); }
    dd { margin:0; min-width:0; overflow-wrap:anywhere; }
    code { color:#f1ca89; font:12px/1.45 ui-monospace,monospace; overflow-wrap:anywhere; }
    .missing { color:#ef9a8d; }
    footer { border-top:1px solid var(--rule); color:var(--muted); margin-top:48px; padding-top:24px; }
    @media (max-width:850px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body><main>
  <p class="status">Unselected · director review only</p>
  <h1>Casting round two</h1>
  <p class="lede">Six exact ElevenLabs <code>${escapeHtml(metadata.modelId)}</code> audition takes for issue #27. The lines remain proposed during the async-veto window. This packet records no winner, approval, CAST-map change, or scene wiring.</p>
  ${roleSections}
  <footer>Listen to every option within a role at matched settings. Select one, request a revision, or reject all. Generated takes are review artifacts and must not be copied into runtime assets before a director decision.</footer>
</main></body></html>`;
}

function saveReview(cache) {
  const validation = validateCache(cache);
  const metadata = publicMetadata(validation);
  const root = resolve(projectRoot, OUTPUT_ROOT);
  mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, "manifest.json"), JSON.stringify(metadata, null, 2));
  writeFileSync(resolve(root, "review.html"), reviewHtml(metadata));
  writeFileSync(resolve(projectRoot, TAKES_ROOT, "index.json"), JSON.stringify(metadata, null, 2));
  return validation;
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

export async function ensureVoice(candidate, key, fetchImpl) {
  const existing = await fetchImpl(`https://api.elevenlabs.io/v1/voices/${candidate.voiceId}`, {
    headers: { "xi-api-key": key },
  });
  if (existing.ok) return;
  const detail = await errorDetail(existing);
  // The voice endpoint currently reports a missing public-library voice as
  // HTTP 400, while older behavior and other endpoints use 404.
  if (existing.status !== 404 && !(existing.status === 400 && /not found/i.test(String(detail)))) {
    throw new Error(`voice lookup failed for ${candidate.id}: HTTP ${existing.status} ${detail}`);
  }
  if (!candidate.publicOwnerId) {
    throw new Error(
      `voice ${candidate.voiceId} for ${candidate.id} is not available in this account and has no public-library owner id`
    );
  }

  const added = await fetchImpl(
    `https://api.elevenlabs.io/v1/voices/add/${candidate.publicOwnerId}/${candidate.voiceId}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: `IW27 ${candidate.sourceName}`, bookmarked: true }),
    }
  );
  if (!added.ok) {
    throw new Error(`voice add failed for ${candidate.id}: HTTP ${added.status} ${await errorDetail(added)}`);
  }
}

export async function run(argv = process.argv.slice(2), fetchImpl = fetch) {
  const { mode, requested } = parseArgs(argv);
  if (mode === "help") {
    console.log("Usage: node pipeline/casting-round-two.mjs (--dry-run | --audit | --generate) [--candidate <id>]");
    return;
  }
  const selected = selectCandidates(requested);
  for (const candidate of selected) {
    const role = roleFor(candidate);
    console.log(`${candidate.id.padEnd(26)} ${candidate.voiceId} ${artifactPath(candidate)}`);
    console.log(`  tag=${role.tag} settings=${JSON.stringify(role.settings)}`);
    console.log(`  text=${JSON.stringify(auditionText(role))}`);
    console.log(`  signature=${candidateSignature(candidate)}`);
  }
  if (mode === "dry-run") return;

  const cache = loadCache(CACHE_FILE);
  if (mode === "audit") {
    const validation = saveReview(cache);
    if (validation.invalid.length) {
      throw new Error(`audit failed: ${validation.invalid.map(({ id, reason }) => `${id} (${reason})`).join(", ")}`);
    }
    console.log(`audit passed - ${Object.keys(validation.valid).length} exact artifacts verified`);
    return;
  }

  const key = requireKey("ELEVENLABS_API_KEY", "casting-round-two audition generation");
  let generated = 0;
  let cached = 0;
  for (const candidate of selected) {
    if (invalidReason(candidate, cache[candidate.id]) === null) {
      cached++;
      continue;
    }
    await ensureVoice(candidate, key, fetchImpl);
    console.log(`tts ${candidate.id}...`);
    const response = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${candidate.voiceId}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(requestFor(candidate)),
      }
    );
    if (!response.ok) {
      throw new Error(`tts failed for ${candidate.id}: HTTP ${response.status} ${await errorDetail(response)}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    const output = resolve(projectRoot, artifactPath(candidate));
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(output, audio);
    cache[candidate.id] = {
      signature: candidateSignature(candidate),
      sha256: sha256(audio),
      bytes: audio.byteLength,
      durationSeconds: probeDuration(output),
      generatedAt: new Date().toISOString(),
    };
    saveCache(CACHE_FILE, cache);
    saveReview(cache);
    generated++;
  }
  const validation = saveReview(cache);
  console.log(`done - ${generated} generated, ${cached} cached, ${selected.length} requested, ${Object.keys(validation.valid).length} exact artifacts verified`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
