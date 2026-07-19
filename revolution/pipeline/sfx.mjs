/**
 * Audited ElevenLabs text-to-sound-effects pipeline.
 *
 * Safe modes:
 *   node pipeline/sfx.mjs --audit [--only <cue-or-file>]
 *   node pipeline/sfx.mjs --dry-run [--only <cue-or-file>]
 *
 * Paid mode is deliberately targeted:
 *   node pipeline/sfx.mjs --generate --only <cue-or-file> [--only ...]
 *     [--asset-root <dir>] [--cache-file <file>]
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, projectRoot, readEnvValue } from "./lib.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const PLAN_FILE = resolve(dirname(MODULE_PATH), "sfx.plan.json");
const DEFAULT_CACHE_FILE = resolve(projectRoot, "pipeline", ".sfx-cache.json");
const DEFAULT_ASSET_ROOT = resolve(projectRoot, "public", "assets", "audio");

export const USAGE = `Usage:
  node pipeline/sfx.mjs --audit [--only <cue-or-file>]
  node pipeline/sfx.mjs --dry-run [--only <cue-or-file>]
  node pipeline/sfx.mjs --generate --only <cue-or-file> [--only ...]
    [--asset-root <dir>] [--cache-file <file>]

--audit and --dry-run never read credentials or make network requests.
--generate is paid and requires at least one explicit --only target.`;

export function loadSoundPlan(path = PLAN_FILE) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Preserve the legacy trusted-cache signature exactly. */
export function assetSignature(asset) {
  return hash({ file: asset.file, seconds: asset.seconds, prompt: asset.prompt });
}

function resolveProjectPath(path) {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

export function parseCliArgs(argv) {
  const parsed = {
    mode: null,
    only: [],
    assetRoot: DEFAULT_ASSET_ROOT,
    cacheFile: DEFAULT_CACHE_FILE,
    help: false,
  };
  const modes = new Set(["--audit", "--dry-run", "--generate"]);

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (modes.has(arg)) {
      if (parsed.mode) throw new Error(`choose exactly one mode; received ${parsed.mode} and ${arg}`);
      parsed.mode = arg.slice(2);
      continue;
    }
    if (arg === "--only") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--only requires a cue id, asset id, or file");
      parsed.only.push(value);
      continue;
    }
    if (arg === "--asset-root") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--asset-root requires a directory");
      parsed.assetRoot = resolveProjectPath(value);
      continue;
    }
    if (arg === "--cache-file") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--cache-file requires a file");
      parsed.cacheFile = resolveProjectPath(value);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (parsed.help) return parsed;
  if (!parsed.mode) throw new Error("one of --audit, --dry-run, or --generate is required");
  if (parsed.mode === "generate" && parsed.only.length === 0) {
    throw new Error("--generate requires at least one --only target");
  }
  parsed.only = [...new Set(parsed.only)];
  return parsed;
}

export function validatePlan(plan) {
  if (plan.provider?.endpoint !== "https://api.elevenlabs.io/v1/sound-generation") {
    throw new Error("SFX provider must remain ElevenLabs POST /v1/sound-generation");
  }
  const files = new Set();
  const cueIds = new Set();
  for (const asset of plan.assets ?? []) {
    if (files.has(asset.file)) throw new Error(`duplicate asset file: ${asset.file}`);
    files.add(asset.file);
    const prompt = asset.prompt.toLowerCase();
    if (!prompt.includes("no music")) throw new Error(`prompt must exclude music: ${asset.file}`);
    if (!asset.lockedBaseline && !prompt.includes("no human voices")) {
      throw new Error(`delta prompt must exclude human voices: ${asset.file}`);
    }
  }
  for (const scene of plan.scenes ?? []) {
    for (const cue of scene.cues ?? []) {
      if (cueIds.has(cue.id)) throw new Error(`duplicate cue id: ${cue.id}`);
      cueIds.add(cue.id);
      if (cue.asset && !files.has(cue.asset)) throw new Error(`unknown cue asset: ${cue.asset}`);
      if (cue.kind === "authored-silence" && cue.asset) {
        throw new Error(`authored silence cannot generate media: ${cue.id}`);
      }
    }
  }
  return plan;
}

function cueIdsByAsset(plan) {
  const result = new Map(plan.assets.map((asset) => [asset.file, []]));
  for (const scene of plan.scenes) {
    for (const cue of scene.cues) {
      if (cue.asset) result.get(cue.asset)?.push(cue.id);
    }
  }
  return result;
}

export function selectAssets(plan, only) {
  if (only.length === 0) return plan.assets;
  const cueIds = cueIdsByAsset(plan);
  const selected = [];
  for (const target of only) {
    const matches = plan.assets.filter((asset) =>
      asset.id === target || asset.file === target || cueIds.get(asset.file)?.includes(target)
    );
    if (matches.length === 0) throw new Error(`unknown --only target: ${target}`);
    for (const asset of matches) if (!selected.includes(asset)) selected.push(asset);
  }
  return selected;
}

export function loadCacheAt(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

export function saveCacheAt(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function inspectAsset(asset, cache, assetRoot) {
  const path = resolve(assetRoot, asset.file);
  const signature = assetSignature(asset);
  const outputExists = existsSync(path);
  const cacheMatches = cache[asset.file] === signature;
  return {
    asset,
    path,
    signature,
    outputExists,
    cacheMatches,
    status: outputExists && cacheMatches
      ? "cached"
      : outputExists
        ? "changed"
        : cacheMatches
          ? "missing-output"
          : "missing",
    ...(outputExists ? { bytes: statSync(path).size, sha256: sha256(path) } : {}),
  };
}

function printInspection(entry, log) {
  const details = entry.outputExists ? ` ${entry.bytes} bytes sha256=${entry.sha256}` : "";
  log(`${entry.status.padEnd(14)} ${entry.asset.file}${details}`);
}

export async function executeSfx(argv, dependencies = {}) {
  // Argument and target validation must finish before credential access.
  const options = parseCliArgs(argv);
  if (options.help) return { options, plan: null, inspections: [] };
  const plan = validatePlan(dependencies.plan ?? loadSoundPlan());
  const selected = selectAssets(plan, options.only);
  const cache = dependencies.loadCache?.(options.cacheFile) ?? loadCacheAt(options.cacheFile);
  const inspections = selected.map((asset) => inspectAsset(asset, cache, options.assetRoot));
  const log = dependencies.log ?? console.log;

  if (options.mode === "audit") {
    inspections.forEach((entry) => printInspection(entry, log));
    return { options, plan, inspections, generated: 0 };
  }

  const pending = inspections.filter((entry) => entry.status !== "cached");
  if (options.mode === "dry-run") {
    inspections.forEach((entry) => {
      printInspection(entry, log);
      if (entry.status !== "cached") log(`would-generate ${entry.asset.file}`);
    });
    return { options, plan, inspections, generated: 0 };
  }

  for (const entry of pending) {
    if (entry.asset.lockedBaseline) {
      throw new Error(`locked baseline is not regenerable: ${entry.asset.file}`);
    }
  }
  if (pending.length === 0) {
    inspections.forEach((entry) => printInspection(entry, log));
    log(`done - 0 generated, ${inspections.length} cached`);
    return { options, plan, inspections, generated: 0 };
  }

  const getCredential = dependencies.getCredential ?? (() => readEnvValue("ELEVENLABS_API_KEY"));
  const key = getCredential();
  if (!key) throw new Error("ELEVENLABS_API_KEY is required for explicit --generate mode");
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const writeOutput = dependencies.writeOutput ?? ((path, bytes) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  });
  const persistCache = dependencies.saveCache ?? saveCacheAt;
  let generated = 0;

  for (const entry of inspections) {
    if (entry.status === "cached") {
      printInspection(entry, log);
      continue;
    }
    log(`generate       ${entry.asset.file}`);
    const response = await fetchImpl(plan.provider.endpoint, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: entry.asset.prompt,
        duration_seconds: entry.asset.seconds,
        prompt_influence: plan.provider.promptInfluence,
      }),
    });
    if (!response.ok) {
      throw new Error(`SFX request failed for ${entry.asset.file}: ${response.status} ${await response.text()}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error(`SFX request returned an empty file: ${entry.asset.file}`);
    writeOutput(entry.path, bytes);
    cache[entry.asset.file] = entry.signature;
    // The paid call is recoverable before the next request begins.
    persistCache(options.cacheFile, cache);
    generated++;
  }

  log(`done - ${generated} generated, ${inspections.length - generated} cached`);
  return { options, plan, inspections, generated };
}

async function main() {
  try {
    const result = await executeSfx(process.argv.slice(2));
    if (result.options.help) console.log(USAGE);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === MODULE_PATH) await main();

