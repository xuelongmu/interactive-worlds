import assert from "node:assert/strict";
import test from "node:test";
import {
  BRANCH_ACTION_MAPPINGS,
  BRANCH_COMMAND_ERROR_MESSAGE,
  BRANCH_SELECTION_ACKNOWLEDGEMENTS,
  BRANCH_STATE_STORAGE_KEY,
  BRANCH_STATE_VERSION,
  applyBranchRuntimeEvent,
  branchStateForEntry,
  createBranchChoiceLatch,
  createBranchState,
  decodeBranchState,
  encodeBranchState,
  getBranchChoice,
  getBranchPresentation,
  getDelawareDuty,
  getSaratogaAnalysisLens,
  getTeaPartyDeckDuty,
  getTrentonPerspective,
  loadBranchState,
  resetBranchState,
  saveBranchState,
  selectBranchChoice,
  selectDelawareDuty,
  selectSaratogaAnalysisLens,
  selectTeaPartyDeckDuty,
  selectTrentonPerspective,
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
  assert.equal(getTrentonPerspective(state), null);
  assert.equal(getSaratogaAnalysisLens(state), null);
}

function selectAllChoices() {
  return selectSaratogaAnalysisLens(
    selectTrentonPerspective(
      selectDelawareDuty(
        selectTeaPartyDeckDuty(createBranchState(), "break-chest"),
        "pole",
      ),
      "stay-with-column",
    ),
    "inspect-supply-line",
  );
}

function mapping(momentId, binding) {
  const found = BRANCH_ACTION_MAPPINGS.find(
    (candidate) =>
      candidate.momentId === momentId && candidate.binding === binding,
  );
  assert.ok(found, `${momentId} must define ${binding}`);
  return found;
}

function confirmedEvent(actionMapping) {
  return {
    type: "branch-confirmed",
    id: actionMapping.confirmationEventId,
    requestId: actionMapping.requestId,
  };
}

test("all four historically convergent moments are neutral by default", () => {
  assertNeutral(createBranchState());
});

test("replayed selections replace only their branch without mutating prior state", () => {
  const initial = createBranchState();
  const firstPass = selectAllChoices();
  const teaReplay = selectTeaPartyDeckDuty(firstPass, "sweep-deck");
  const delawareReplay = selectDelawareDuty(teaReplay, "clear-ice");
  const trentonReplay = selectTrentonPerspective(
    delawareReplay,
    "move-toward-guns",
  );
  const saratogaReplay = selectSaratogaAnalysisLens(
    trentonReplay,
    "trace-river-road",
  );

  assertNeutral(initial);
  assert.deepEqual(firstPass.choices, {
    "tea-party-deck-duty": "break-chest",
    "delaware-duty": "pole",
    "trenton-perspective": "stay-with-column",
    "saratoga-analysis-lens": "inspect-supply-line",
  });
  assert.deepEqual(saratogaReplay.choices, {
    "tea-party-deck-duty": "sweep-deck",
    "delaware-duty": "clear-ice",
    "trenton-perspective": "move-toward-guns",
    "saratoga-analysis-lens": "trace-river-road",
  });
  assert.equal(getTeaPartyDeckDuty(firstPass), "break-chest");
  assert.equal(getDelawareDuty(firstPass), "pole");
  assert.equal(getTrentonPerspective(firstPass), "stay-with-column");
  assert.equal(getSaratogaAnalysisLens(firstPass), "inspect-supply-line");
  assert.notEqual(saratogaReplay, trentonReplay);
  assert.notEqual(saratogaReplay.choices, trentonReplay.choices);
});

test("the v2 codec round-trips four choices in deterministic chapter order", () => {
  const selected = selectAllChoices();
  const encoded = encodeBranchState(selected);

  assert.equal(
    encoded,
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole","trenton-perspective":"stay-with-column","saratoga-analysis-lens":"inspect-supply-line"}}',
  );
  assert.deepEqual(decodeBranchState(encoded), selected);
});

test("persisted v1 Delaware state migrates with the other three moments neutral", () => {
  const migrated = decodeBranchState(
    '{"version":1,"choices":{"delaware-duty":"clear-ice"}}',
  );

  assert.deepEqual(migrated, {
    version: 2,
    choices: {
      "tea-party-deck-duty": null,
      "delaware-duty": "clear-ice",
      "trenton-perspective": null,
      "saratoga-analysis-lens": null,
    },
  });
  assert.equal(
    encodeBranchState(migrated),
    '{"version":2,"choices":{"tea-party-deck-duty":null,"delaware-duty":"clear-ice","trenton-perspective":null,"saratoga-analysis-lens":null}}',
  );
  assertNeutral(
    decodeBranchState('{"version":1,"choices":{"delaware-duty":null}}'),
  );
});

test("chapter transitions, resume, and chapter select preserve every choice", () => {
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

test("each choice moment exposes an exact readonly E/F pair and one objective", () => {
  const cases = [
    {
      context: "tea-party-deck-duty-choice",
      momentId: "tea-party-deck-duty",
      objective: "Choose your first deck duty.",
      labels: ["Break a chest", "Sweep the deck"],
      choices: [
        "tea-party-deck-duty.break-chest",
        "tea-party-deck-duty.sweep-deck",
      ],
    },
    {
      context: "delaware-duty-choice",
      momentId: "delaware-duty",
      objective: "Choose your duty for the crossing.",
      labels: ["Pole from the bow", "Clear ice from the hull"],
      choices: ["delaware-duty.pole", "delaware-duty.clear-ice"],
    },
    {
      context: "trenton-perspective-choice",
      momentId: "trenton-perspective",
      objective: "Choose where to advance.",
      labels: ["Stay with the column", "Move toward the guns"],
      choices: [
        "trenton-perspective.stay-with-column",
        "trenton-perspective.move-toward-guns",
      ],
    },
    {
      context: "saratoga-analysis-lens-choice",
      momentId: "saratoga-analysis-lens",
      objective: "Choose how to study the campaign.",
      labels: ["Trace the river road", "Inspect the supply line"],
      choices: [
        "saratoga-analysis-lens.trace-river-road",
        "saratoga-analysis-lens.inspect-supply-line",
      ],
    },
  ];

  for (const expected of cases) {
    const presentation = getBranchPresentation(
      createBranchState(),
      expected.context,
      { usable: true },
    );
    assert.equal(presentation.kind, "branch-presentation-v2");
    assert.equal(presentation.context, expected.context);
    assert.equal(presentation.momentId, expected.momentId);
    assert.equal(presentation.objective, expected.objective);
    assert.equal(presentation.selectedChoiceId, null);
    assert.equal(presentation.latchedChoiceId, null);
    assert.equal(presentation.acknowledgement, null);
    assert.ok(Object.isFrozen(presentation.actions));
    assert.deepEqual(
      presentation.actions.map((action) => ({
        id: action.id,
        momentId: action.momentId,
        choiceId: action.choiceId,
        requestId: action.requestId,
        confirmationEventId: action.confirmationEventId,
        binding: action.binding,
        label: action.label,
        usable: action.usable,
      })),
      ["E", "F"].map((binding, index) => ({
        id: `branch-action:${expected.choices[index]}`,
        momentId: expected.momentId,
        choiceId: expected.choices[index],
        requestId: `branch-request:${expected.choices[index]}`,
        confirmationEventId: `branch-confirmed:${expected.choices[index]}`,
        binding,
        label: expected.labels[index],
        usable: true,
      })),
    );
  }
});

test("presentation readiness is neutral until runtime marks both actions usable", () => {
  const neutral = getBranchPresentation(
    createBranchState(),
    "trenton-perspective-choice",
  );
  assert.deepEqual(
    neutral.actions.map((action) => [action.binding, action.usable]),
    [
      ["E", false],
      ["F", false],
    ],
  );
});

test("all eight backend confirmations latch and persist their mapped choice", () => {
  for (const actionMapping of BRANCH_ACTION_MAPPINGS) {
    const initial = createBranchState();
    const latch = createBranchChoiceLatch(actionMapping.momentId);
    const result = applyBranchRuntimeEvent(
      initial,
      latch,
      confirmedEvent(actionMapping),
    );

    assert.equal(
      getBranchChoice(result.state, actionMapping.momentId),
      actionMapping.choice,
    );
    assert.deepEqual(result.latch, {
      momentId: actionMapping.momentId,
      latchedChoiceId: actionMapping.choiceId,
      requestId: actionMapping.requestId,
    });
    assert.deepEqual(result.handoff, {
      outcome: "latched",
      momentId: actionMapping.momentId,
      actionId: actionMapping.actionId,
      choiceId: actionMapping.choiceId,
      requestId: actionMapping.requestId,
      acknowledgement:
        BRANCH_SELECTION_ACKNOWLEDGEMENTS[actionMapping.choiceId],
      error: null,
    });
    assertNeutral(initial);

    const presentation = getBranchPresentation(
      result.state,
      `${actionMapping.momentId}-choice`,
      { latch: result.latch },
    );
    assert.equal(presentation.selectedChoiceId, actionMapping.choiceId);
    assert.equal(presentation.latchedChoiceId, actionMapping.choiceId);
  }
});

test("one entry latch accepts only the first confirmed edge", () => {
  const e = mapping("trenton-perspective", "E");
  const f = mapping("trenton-perspective", "F");
  const first = applyBranchRuntimeEvent(
    createBranchState(),
    createBranchChoiceLatch("trenton-perspective"),
    confirmedEvent(e),
  );
  const repeated = applyBranchRuntimeEvent(
    first.state,
    first.latch,
    confirmedEvent(f),
  );

  assert.equal(getTrentonPerspective(repeated.state), "stay-with-column");
  assert.equal(repeated.handoff.outcome, "ignored");
  assert.equal(repeated.handoff.choiceId, "trenton-perspective.move-toward-guns");
  assert.equal(repeated.state, first.state);
  assert.equal(repeated.latch, first.latch);
});

test("a fresh replay latch can immutably replace the persisted choice", () => {
  const e = mapping("delaware-duty", "E");
  const f = mapping("delaware-duty", "F");
  const first = applyBranchRuntimeEvent(
    createBranchState(),
    createBranchChoiceLatch("delaware-duty"),
    confirmedEvent(e),
  );
  const replay = applyBranchRuntimeEvent(
    first.state,
    createBranchChoiceLatch("delaware-duty"),
    confirmedEvent(f),
  );

  assert.equal(getDelawareDuty(first.state), "pole");
  assert.equal(getDelawareDuty(replay.state), "clear-ice");
  assert.notEqual(replay.state, first.state);
  assert.equal(replay.handoff.outcome, "latched");
});

test("command_error is visible and retryable without confirming or persisting", () => {
  const action = mapping("tea-party-deck-duty", "F");
  const initial = createBranchState();
  const latch = createBranchChoiceLatch("tea-party-deck-duty");
  const failed = applyBranchRuntimeEvent(initial, latch, {
    type: "command_error",
    requestId: action.requestId,
  });

  assert.equal(failed.state, initial);
  assert.equal(failed.latch, latch);
  assert.deepEqual(failed.handoff, {
    outcome: "command_error",
    momentId: "tea-party-deck-duty",
    actionId: action.actionId,
    choiceId: action.choiceId,
    requestId: action.requestId,
    acknowledgement: null,
    error: {
      message: BRANCH_COMMAND_ERROR_MESSAGE,
      visible: true,
      retryable: true,
    },
  });
  assertNeutral(failed.state);

  const retry = applyBranchRuntimeEvent(
    failed.state,
    failed.latch,
    confirmedEvent(action),
  );
  assert.equal(retry.handoff.outcome, "latched");
  assert.equal(getTeaPartyDeckDuty(retry.state), "sweep-deck");
});

test("later chapters acknowledge both paths while outcomes and actions stay common", () => {
  const callbackCases = [
    {
      state: selectTeaPartyDeckDuty(createBranchState(), "break-chest"),
      context: "lexington-deck-duty-acknowledgement",
      acknowledgement: "At Griffin's Wharf, you chose the hatchet.",
      actions: null,
    },
    {
      state: selectTeaPartyDeckDuty(createBranchState(), "sweep-deck"),
      context: "lexington-deck-duty-acknowledgement",
      acknowledgement: "At Griffin's Wharf, you chose the broom.",
      actions: null,
    },
    {
      state: selectDelawareDuty(createBranchState(), "pole"),
      context: "trenton-perspective-choice",
      acknowledgement: "At the crossing, you chose to pole from the bow.",
      actions: ["E", "F"],
    },
    {
      state: selectDelawareDuty(createBranchState(), "clear-ice"),
      context: "trenton-perspective-choice",
      acknowledgement: "At the crossing, you chose to clear ice from the hull.",
      actions: ["E", "F"],
    },
    {
      state: selectTrentonPerspective(createBranchState(), "stay-with-column"),
      context: "saratoga-analysis-lens-choice",
      acknowledgement: "At Trenton, you stayed with the column.",
      actions: ["E", "F"],
    },
    {
      state: selectTrentonPerspective(createBranchState(), "move-toward-guns"),
      context: "saratoga-analysis-lens-choice",
      acknowledgement: "At Trenton, you moved toward the guns.",
      actions: ["E", "F"],
    },
    {
      state: selectSaratogaAnalysisLens(createBranchState(), "trace-river-road"),
      context: "valley-forge-analysis-acknowledgement",
      acknowledgement: "At Saratoga, you traced the river road.",
      actions: null,
    },
    {
      state: selectSaratogaAnalysisLens(
        createBranchState(),
        "inspect-supply-line",
      ),
      context: "valley-forge-analysis-acknowledgement",
      acknowledgement: "At Saratoga, you inspected the supply line.",
      actions: null,
    },
  ];

  for (const expected of callbackCases) {
    const presentation = getBranchPresentation(
      expected.state,
      expected.context,
      { usable: true },
    );
    assert.equal(presentation.acknowledgement, expected.acknowledgement);
    assert.deepEqual(
      presentation.actions?.map((action) => action.binding) ?? null,
      expected.actions,
    );
  }
});

test("neutral callbacks and out-of-range presentation fabricate nothing", () => {
  const neutral = createBranchState();
  for (const context of [
    "lexington-deck-duty-acknowledgement",
    "valley-forge-analysis-acknowledgement",
    "out-of-range",
  ]) {
    const presentation = getBranchPresentation(neutral, context);
    assert.equal(presentation.momentId, null);
    assert.equal(presentation.objective, null);
    assert.equal(presentation.actions, null);
    assert.equal(presentation.selectedChoiceId, null);
    assert.equal(presentation.latchedChoiceId, null);
    assert.equal(presentation.acknowledgement, null);
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

test("storage failures and corrupt four-moment records take the atomic neutral path", () => {
  const invalidRecords = [
    null,
    "not-json",
    "[]",
    '{"version":3,"choices":{"tea-party-deck-duty":null,"delaware-duty":"pole","trenton-perspective":null,"saratoga-analysis-lens":null}}',
    '{"version":1,"choices":{"delaware-duty":"steer-history"}}',
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole","saratoga-analysis-lens":"trace-river-road"}}',
    '{"version":2,"choices":{"tea-party-deck-duty":"break-chest","delaware-duty":"pole","trenton-perspective":"rewrite-history","saratoga-analysis-lens":"trace-river-road"}}',
  ];

  for (const raw of invalidRecords) assertNeutral(decodeBranchState(raw));

  assertNeutral(
    loadBranchState({
      getItem() {
        throw new Error("storage unavailable");
      },
    }),
  );
});

test("invalid IDs, values, mappings, and latch contexts are rejected", () => {
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
    () => selectTrentonPerspective(createBranchState(), "rewrite-history"),
    /Unknown trenton-perspective choice/,
  );
  assert.throws(
    () => createBranchChoiceLatch("not-a-moment"),
    /Unknown branch moment/,
  );

  const teaAction = mapping("tea-party-deck-duty", "E");
  const delawareAction = mapping("delaware-duty", "E");
  assert.throws(
    () =>
      applyBranchRuntimeEvent(
        createBranchState(),
        createBranchChoiceLatch("tea-party-deck-duty"),
        confirmedEvent(delawareAction),
      ),
    /does not belong/,
  );
  assert.throws(
    () =>
      applyBranchRuntimeEvent(
        createBranchState(),
        createBranchChoiceLatch("tea-party-deck-duty"),
        {
          type: "branch-confirmed",
          id: delawareAction.confirmationEventId,
          requestId: teaAction.requestId,
        },
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      getBranchPresentation(
        createBranchState(),
        "delaware-duty-choice",
        { latch: createBranchChoiceLatch("trenton-perspective") },
      ),
    /does not match presentation/,
  );
});
