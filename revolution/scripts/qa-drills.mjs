#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = resolve(projectRoot, "node_modules", "vitest", "vitest.mjs");

export const AUTOMATED_DRILL_COVERAGE = Object.freeze([
  "session-start-failure",
  "mid-session-disconnect",
  "missing-vo-subtitle-only",
  "deferred-readiness",
  "story-state-refresh-resume-clear-signature",
  "session-teardown",
]);

export const MANUAL_ACCEPTANCE_GATES = Object.freeze([
  "real-browser-matrix",
  "real-reactor-dashboard",
  "full-day-orphan-session-audit",
]);

export const QA_DRILL_STEPS = Object.freeze([
  Object.freeze({
    id: "state-and-loading",
    label: "story state, missing VO, and loading semantics",
    command: process.execPath,
    args: Object.freeze([
      "--test",
      "--experimental-strip-types",
      "src/qa.test.mjs",
      "src/engine/state.test.mjs",
      "src/shell.test.mjs",
      "src/engine/pause.test.mjs",
    ]),
  }),
  Object.freeze({
    id: "fallback-and-hygiene",
    label: "fallback, deferred readiness, and session teardown",
    command: process.execPath,
    args: Object.freeze([
      vitestCli,
      "run",
      "src/renderers/worldmodel.test.ts",
      "src/engine/director.test.ts",
    ]),
  }),
]);

export function runQaDrills({
  steps = QA_DRILL_STEPS,
  run = spawnSync,
  write = (message) => process.stdout.write(message),
} = {}) {
  write("Deterministic local QA drills\n");
  for (const step of steps) {
    write(`\n[${step.id}] ${step.label}\n`);
    const result = run(step.command, [...step.args], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    if (result.error) {
      write(`\nFAIL ${step.id}: ${result.error.message}\n`);
      return 1;
    }
    if (result.status !== 0) {
      write(`\nFAIL ${step.id}: exited ${result.status ?? "without a status"}\n`);
      return 1;
    }
  }

  write("\nPASS deterministic local QA drills\n");
  write("Manual browser, Reactor dashboard, and full-day gates remain NOT RUN.\n");
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) process.exitCode = runQaDrills();
