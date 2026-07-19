import assert from "node:assert/strict";
import test from "node:test";
import {
  BRANCH_STATE_STORAGE_KEY,
  BRANCH_STATE_VERSION,
  branchStateForEntry,
  createBranchState,
  decodeBranchState,
  encodeBranchState,
  getBranchPresentation,
  getDelawareDuty,
  getSaratogaAnalysisLens,
  getTeaPartyDeckDuty,
  loadBranchState,
  resetBranchState,
  saveBranchState,
  selectBranchChoice,
  selectDelawareDuty,
  selectSaratogaAnalysisLens,
  selectTeaPartyDeckDuty,
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

function assertNeutral(state) {
  assert.equal(state.version, BRANCH_STATE_VERSION);
  assert.equal(getTeaPartyDeckDuty(state), null);
  assert.equal(getDelawareDuty(state), null);
  assert.equal(getSaratogaAnalysisLens(state), null);
}

function selectAllChoices() {
  return selectSaratogaAnalysisLens(
    selectDelawareDuty(
      selectTeaPartyDeckDuty(createBranchState(), "break-chest"),
      "pole",
    ),
    "inspect-supply-line",
  );
}

test("all three historically convergent branches are neutral by default", () => {
  assertNeutral(createBranchState());
});

test("replayed selections replace only their branch without mutating prior state", () => {
  const initial = createBranchState();
  const firstPass = selectAllChoices();
  const teaReplay = selectTeaPartyDeckDuty(firstPass, "sweep-deck");
  const delawareReplay = selectDelawareDuty(teaReplay, "clear-ice");
  const saratogaReplay = selectSaratogaAnalysisLens(
    delawareReplay,
    "trace-river-road",
  );

  assertNeutral(initial);
  assert.deepEqual(firstPass.choices, {
    "tea-party-deck-duty": "break-chest",
    "delaware-duty": "pole",
    "saratoga-analysis-lens": "inspect-supply-line",
  });
  assert.deepEqual(saratogaReplay.choices, {
    "tea-party-deck-duty": "sweep-deck",
    "delaware-duty": "clear-ice",
    "saratoga-analysis-lens": "trace-river-road",
  });
  assert.equal(getTeaPartyDeckDuty(firstPass), "break-chest");
  assert.equal(getDelawareDuty(firstPass), "pole");
  assert.equal(getSaratogaAnalysisLens(firstPass), "inspect-supply-line");
  assert.notEqual(saratogaReplay, delawareReplay);
  assert.notEqual(saratogaReplay.choices, delawareReplay.choices);
});

test("the v2 codec round-trips every choice in deterministic chapter order", () => {
  const selected = selectAllChoices();
  const encoded = encodeBranchState(selected);

  assert.equal(
    encoded,
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole","saratoga-analysis-lens":"inspect-supply-line"}}',
  );
  assert.deepEqual(decodeBranchState(encoded), selected);
});

test("persisted v1 Delaware state migrates deterministically with new branches neutral", () => {
  const migrated = decodeBranchState(
    '{"version":1,"choices":{"delaware-duty":"clear-ice"}}',
  );

  assert.deepEqual(migrated, {
    version: 2,
    choices: {
      "tea-party-deck-duty": null,
      "delaware-duty": "clear-ice",
      "saratoga-analysis-lens": null,
    },
  });
  assert.equal(
    encodeBranchState(migrated),
    '{"version":2,"choices":{"tea-party-deck-duty":null,"delaware-duty":"clear-ice","saratoga-analysis-lens":null}}',
  );
  assertNeutral(
    decodeBranchState('{"version":1,"choices":{"delaware-duty":null}}'),
  );
});

test("chapter transitions, resume, and chapter select preserve every branch", () => {
  const selected = selectAllChoices();

  for (const mode of ["chapter-transition", "resume", "chapter-select"]) {
    const entered = branchStateForEntry(selected, mode);
    assert.deepEqual(entered, selected, mode);
    assert.notEqual(entered, selected, `${mode} should return immutable state`);
    assert.notEqual(
      entered.choices,
      selected.choices,
      `${mode} should copy the choices record`,
    );
  }
});

test("Tea Party presentation exposes exact bound deck duties", () => {
  const state = createBranchState();

  assert.deepEqual(getBranchPresentation(state, "tea-party-break-chest-choice"), {
    selectedDuty: null,
    acknowledgement: null,
    action: { binding: "E", label: "Break a chest", usable: true },
  });
  assert.deepEqual(
    getBranchPresentation(state, "tea-party-sweep-deck-choice", false),
    {
      selectedDuty: null,
      acknowledgement: null,
      action: { binding: "E", label: "Sweep the deck", usable: false },
    },
  );
});

test("Lexington presentation acknowledges either Tea Party duty without narration", () => {
  const hatchet = selectTeaPartyDeckDuty(createBranchState(), "break-chest");
  const broom = selectTeaPartyDeckDuty(createBranchState(), "sweep-deck");

  assert.deepEqual(
    getBranchPresentation(hatchet, "lexington-deck-duty-acknowledgement"),
    {
      selectedDuty: null,
      acknowledgement: "At Griffin's Wharf, you chose the hatchet.",
      action: null,
    },
  );
  assert.deepEqual(
    getBranchPresentation(broom, "lexington-deck-duty-acknowledgement"),
    {
      selectedDuty: null,
      acknowledgement: "At Griffin's Wharf, you chose the broom.",
      action: null,
    },
  );
});

test("Delaware presentation retains exact bound duties", () => {
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
  assert.deepEqual(getBranchPresentation(clearIce, "trenton-common"), {
    selectedDuty: "clear-ice",
    acknowledgement: null,
    action: { binding: "E", label: "Advance", usable: true },
  });
});

test("Saratoga presentation exposes exact bound analysis lenses", () => {
  const state = createBranchState();

  assert.deepEqual(getBranchPresentation(state, "saratoga-river-road-choice"), {
    selectedDuty: null,
    acknowledgement: null,
    action: { binding: "E", label: "Trace the river road", usable: true },
  });
  assert.deepEqual(
    getBranchPresentation(state, "saratoga-supply-line-choice", false),
    {
      selectedDuty: null,
      acknowledgement: null,
      action: { binding: "E", label: "Inspect the supply line", usable: false },
    },
  );
});

test("Valley Forge presentation acknowledges either lens with contextual attention", () => {
  const road = selectSaratogaAnalysisLens(
    createBranchState(),
    "trace-river-road",
  );
  const supply = selectSaratogaAnalysisLens(
    createBranchState(),
    "inspect-supply-line",
  );

  assert.deepEqual(
    getBranchPresentation(road, "valley-forge-analysis-acknowledgement"),
    {
      selectedDuty: null,
      acknowledgement: "At Saratoga, you traced the river road.",
      action: {
        binding: "E",
        label: "Listen for the drill cadence",
        usable: true,
      },
    },
  );
  assert.deepEqual(
    getBranchPresentation(
      supply,
      "valley-forge-analysis-acknowledgement",
      false,
    ),
    {
      selectedDuty: null,
      acknowledgement: "At Saratoga, you inspected the supply line.",
      action: {
        binding: "E",
        label: "Inspect the supply breakdown",
        usable: false,
      },
    },
  );
});

test("neutral callbacks and out-of-range contexts fabricate no acknowledgement or action", () => {
  const neutral = createBranchState();

  for (const context of [
    "lexington-deck-duty-acknowledgement",
    "trenton-duty-callback",
    "valley-forge-analysis-acknowledgement",
    "out-of-range",
  ]) {
    assert.deepEqual(getBranchPresentation(neutral, context), {
      selectedDuty: null,
      acknowledgement: null,
      action: null,
    });
  }
});

test("full restart returns all-neutral state and clears durable storage", () => {
  const selected = selectAllChoices();
  const storage = memoryStorage();
  saveBranchState(storage, selected);

  assertNeutral(branchStateForEntry(selected, "restart"));
  assertNeutral(resetBranchState(storage));
  assert.equal(storage.has(BRANCH_STATE_STORAGE_KEY), false);
  assert.deepEqual(selected, selectAllChoices(), "restart must not mutate input");
});

test("durable state survives a new load and later chapter selection", () => {
  const storage = memoryStorage();
  const selected = selectAllChoices();
  saveBranchState(storage, selected);

  const reloaded = loadBranchState(storage);
  const laterChapter = branchStateForEntry(reloaded, "chapter-select");

  assert.deepEqual(laterChapter, selected);
});

test("storage read failures and corrupt records take the atomic neutral path", () => {
  const invalidRecords = [
    null,
    "not-json",
    "[]",
    '{"version":3,"choices":{"tea-party-deck-duty":null,"delaware-duty":"pole","saratoga-analysis-lens":null}}',
    '{"version":1,"choices":{"delaware-duty":"steer-history"}}',
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole"}}',
    '{"version":2,"choices":{"tea-party-deck-duty":"rewrite-history","delaware-duty":"pole","saratoga-analysis-lens":"trace-river-road"}}',
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole","saratoga-analysis-lens":"counterfactual"}}',
  ];

  for (const raw of invalidRecords) {
    assertNeutral(decodeBranchState(raw));
  }

  assertNeutral(
    loadBranchState({
      getItem() {
        throw new Error("storage unavailable");
      },
    }),
  );
});

test("invalid JavaScript callers cannot store a choice for the wrong branch", () => {
  assert.throws(
    () =>
      selectBranchChoice(
        createBranchState(),
        "not-a-branch",
        "trace-river-road",
      ),
    /Unknown branch id: not-a-branch/,
  );
  assert.throws(
    () => selectBranchChoice(createBranchState(), "delaware-duty", "break-chest"),
    /Unknown delaware-duty choice/,
  );
  assert.throws(
    () => selectTeaPartyDeckDuty(createBranchState(), "rewrite-history"),
    /Unknown tea-party-deck-duty choice/,
  );
  assert.throws(
    () => selectSaratogaAnalysisLens(createBranchState(), "counterfactual"),
    /Unknown saratoga-analysis-lens choice/,
  );
});
