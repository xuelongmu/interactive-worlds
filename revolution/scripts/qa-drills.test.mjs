import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATED_DRILL_COVERAGE,
  MANUAL_ACCEPTANCE_GATES,
  QA_DRILL_STEPS,
  runQaDrills,
} from "./qa-drills.mjs";

test("drill plan covers the locally automatable issue 22 contracts", () => {
  assert.deepEqual(AUTOMATED_DRILL_COVERAGE, [
    "session-start-failure",
    "mid-session-disconnect",
    "missing-vo-subtitle-only",
    "deferred-readiness",
    "story-state-refresh-resume-clear-signature",
    "session-teardown",
  ]);
  assert.deepEqual(QA_DRILL_STEPS.map(({ id }) => id), [
    "state-and-loading",
    "fallback-and-hygiene",
  ]);
  assert.deepEqual(MANUAL_ACCEPTANCE_GATES, [
    "real-browser-matrix",
    "real-reactor-dashboard",
    "full-day-orphan-session-audit",
  ]);
});

test("drill runner executes every focused step and reports manual gates honestly", () => {
  const calls = [];
  let output = "";
  const status = runQaDrills({
    run(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    write(message) { output += message; },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, QA_DRILL_STEPS.length);
  assert.ok(calls.every(({ options }) => options.stdio === "inherit"));
  assert.match(output, /PASS deterministic local QA drills/);
  assert.match(output, /Manual browser, Reactor dashboard, and full-day gates remain NOT RUN/);
});

test("drill runner stops at the first failed focused step", () => {
  let runs = 0;
  let output = "";
  const status = runQaDrills({
    run() {
      runs += 1;
      return { status: 2 };
    },
    write(message) { output += message; },
  });

  assert.equal(status, 1);
  assert.equal(runs, 1);
  assert.match(output, /FAIL state-and-loading: exited 2/);
  assert.doesNotMatch(output, /PASS deterministic local QA drills/);
});
