import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  for (const envPath of [resolve(projectRoot, ".env"), resolve(projectRoot, "..", ".env")]) {
    if (!existsSync(envPath)) continue;
    const match = readFileSync(envPath, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match) return match[1].trim().replace(/^"(.*)"$|^'(.*)'$/, "$1$2");
  }
  return "";
}

export function requireKey(name, purpose) {
  const value = readEnvValue(name);
  if (!value) {
    console.log(`⚠ ${name} is not set — skipping ${purpose}.`);
    console.log(`  Add it to revolution/.env (see .env.example) and re-run.`);
    process.exit(0);
  }
  return value;
}

export const hash = (payload) =>
  createHash("sha1").update(JSON.stringify(payload)).digest("hex");

/** Content-hash cache so edits regenerate exactly what changed. */
export function loadCache(file) {
  const path = resolve(projectRoot, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
export function saveCache(file, cache) {
  const path = resolve(projectRoot, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export async function download(url, outPath) {
  const absolute = resolve(projectRoot, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  writeFileSync(absolute, Buffer.from(await res.arrayBuffer()));
  console.log(`  ↓ ${outPath} (${(Number(res.headers.get("content-length") ?? 0) / 1e6).toFixed(1)} MB)`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pollUntil(
  fn,
  { intervalMs = 5000, timeoutMs = 15 * 60 * 1000, attemptTimeoutMs = 30_000, label = "operation" }
) {
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  for (;;) {
    let timeoutHandle;
    try {
      // A stalled request must not hang the loop past the overall timeout —
      // bound each attempt and treat a stall like any other retryable error.
      const attempt = fn();
      attempt.catch(() => {}); // a late rejection from a lost race is not unhandled
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`${label}: poll attempt exceeded ${attemptTimeoutMs}ms`)),
          attemptTimeoutMs
        );
      });
      const result = await Promise.race([attempt, timeout]);
      consecutiveErrors = 0;
      if (result) return result;
    } catch (error) {
      // Tolerate transient network failures; only give up after a streak.
      if (++consecutiveErrors >= 5) throw error;
      process.stdout.write("!");
    } finally {
      clearTimeout(timeoutHandle);
    }
    if (Date.now() - startedAt > timeoutMs) throw new Error(`${label} timed out`);
    process.stdout.write(".");
    await sleep(intervalMs);
  }
}
