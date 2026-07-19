import assert from "node:assert/strict";
import test from "node:test";
import {
  BRANCH_STATE_STORAGE_KEY,
  branchStateForEntry,
  createBranchState,
  decodeBranchState,
  encodeBranchState,
  getBranchPresentation,
  getDelawareDuty,
  loadBranchState,
  resetBranchState,
  saveBranchState,
  selectDelawareDuty,
} from "./branch-state.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
}

test("Delaware duty is neutral by default and can be reversibly replaced", () => {
  const initial = createBranchState();
  const pole = selectDelawareDuty(initial, "pole");
  const clearIce = selectDelawareDuty(pole, "clear-ice");

  assert.equal(getDelawareDuty(initial), null);
  assert.equal(getDelawareDuty(pole), "pole");
  assert.equal(getDelawareDuty(clearIce), "clear-ice");
  assert.equal(getDelawareDuty(pole), "pole", "selection must not mutate prior state");
});

test("the versioned codec round-trips a selected duty deterministically", () => {
  const selected = selectDelawareDuty(createBranchState(), "clear-ice");
  const encoded = encodeBranchState(selected);

  assert.equal(
    encoded,
    '{"version":1,"choices":{"delaware-duty":"clear-ice"}}',
  );
  assert.deepEqual(decodeBranchState(encoded), selected);
});

test("chapter transitions, resume, and chapter select preserve branch state", () => {
  const selected = selectDelawareDuty(createBranchState(), "pole");

  for (const mode of ["chapter-transition", "resume", "chapter-select"]) {
    const entered = branchStateForEntry(selected, mode);
    assert.equal(getDelawareDuty(entered), "pole", mode);
    assert.notEqual(entered, selected, `${mode} should return immutable state`);
  }
});

test("HUD presentation exposes exact bound Delaware choices without subtitles", () => {
  const state = createBranchState();

  assert.deepEqual(getBranchPresentation(state, "delaware-pole-choice"), {
    selectedDuty: null,
    acknowledgement: null,
    action: { binding: "E", label: "Pole from the bow", usable: true },
  });
  assert.deepEqual(
    getBranchPresentation(state, "delaware-clear-ice-choice", false),
    {
      selectedDuty: null,
      acknowledgement: null,
      action: { binding: "E", label: "Clear ice from the hull", usable: false },
    },
  );
});

test("Trenton presentation explicitly acknowledges either stored duty", () => {
  const pole = selectDelawareDuty(createBranchState(), "pole");
  const clearIce = selectDelawareDuty(createBranchState(), "clear-ice");

  assert.deepEqual(getBranchPresentation(pole, "trenton-duty-callback"), {
    selectedDuty: "pole",
    acknowledgement: "At the crossing, you chose to pole from the bow.",
    action: { binding: "E", label: "Close the column", usable: true },
  });
  assert.deepEqual(getBranchPresentation(clearIce, "trenton-duty-callback"), {
    selectedDuty: "clear-ice",
    acknowledgement: "At the crossing, you chose to clear ice from the hull.",
    action: { binding: "E", label: "Clear the gun path", usable: true },
  });
});

test("neutral callbacks and out-of-range contexts expose no fabricated action", () => {
  const neutral = createBranchState();

  assert.deepEqual(getBranchPresentation(neutral, "trenton-duty-callback"), {
    selectedDuty: null,
    acknowledgement: null,
    action: null,
  });
  assert.deepEqual(getBranchPresentation(neutral, "out-of-range"), {
    selectedDuty: null,
    acknowledgement: null,
    action: null,
  });
});

test("full restart returns neutral state and clears durable storage", () => {
  const selected = selectDelawareDuty(createBranchState(), "clear-ice");
  const storage = memoryStorage();
  saveBranchState(storage, selected);

  assert.equal(getDelawareDuty(branchStateForEntry(selected, "restart")), null);
  assert.equal(getDelawareDuty(resetBranchState(storage)), null);
  assert.equal(storage.has(BRANCH_STATE_STORAGE_KEY), false);
});

test("durable state survives a new load and later chapter selection", () => {
  const storage = memoryStorage();
  saveBranchState(storage, selectDelawareDuty(createBranchState(), "pole"));

  const reloaded = loadBranchState(storage);
  const laterChapter = branchStateForEntry(reloaded, "chapter-select");

  assert.equal(getDelawareDuty(laterChapter), "pole");
});

test("missing or invalid persisted data takes the neutral common path", () => {
  const invalidRecords = [
    null,
    "not-json",
    "[]",
    '{"version":2,"choices":{"delaware-duty":"pole"}}',
    '{"version":1,"choices":{"delaware-duty":"steer-history"}}',
  ];

  for (const raw of invalidRecords) {
    assert.equal(getDelawareDuty(decodeBranchState(raw)), null, String(raw));
  }
});

test("invalid JavaScript callers cannot store an unknown duty", () => {
  assert.throws(
    () => selectDelawareDuty(createBranchState(), "steer-history"),
    /Unknown Delaware duty/,
  );
});
