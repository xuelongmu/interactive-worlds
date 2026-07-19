/**
 * Versioned state for historically convergent player choices.
 *
 * This record is deliberately separate from engine story progress. It stores
 * only what the viewer chose to do, never a mutable historical outcome.
 */

export const BRANCH_STATE_STORAGE_KEY = "revolution-branch-state";
export const BRANCH_STATE_VERSION = 2 as const;
export const LEGACY_BRANCH_STATE_VERSION = 1 as const;

export const TEA_PARTY_DECK_DUTY_BRANCH_ID = "tea-party-deck-duty" as const;
export const DELAWARE_DUTY_BRANCH_ID = "delaware-duty" as const;
export const SARATOGA_ANALYSIS_LENS_BRANCH_ID = "saratoga-analysis-lens" as const;

/** Chronological order is also the canonical encoded property order. */
export const BRANCH_IDS = [
  TEA_PARTY_DECK_DUTY_BRANCH_ID,
  DELAWARE_DUTY_BRANCH_ID,
  SARATOGA_ANALYSIS_LENS_BRANCH_ID,
] as const;
export type BranchId = (typeof BRANCH_IDS)[number];

export const TEA_PARTY_DECK_DUTIES = ["break-chest", "sweep-deck"] as const;
export type TeaPartyDeckDuty = (typeof TEA_PARTY_DECK_DUTIES)[number];

export const DELAWARE_DUTIES = ["pole", "clear-ice"] as const;
export type DelawareDuty = (typeof DELAWARE_DUTIES)[number];

export const SARATOGA_ANALYSIS_LENSES = [
  "trace-river-road",
  "inspect-supply-line",
] as const;
export type SaratogaAnalysisLens = (typeof SARATOGA_ANALYSIS_LENSES)[number];

export interface BranchChoices {
  readonly [TEA_PARTY_DECK_DUTY_BRANCH_ID]: TeaPartyDeckDuty | null;
  readonly [DELAWARE_DUTY_BRANCH_ID]: DelawareDuty | null;
  readonly [SARATOGA_ANALYSIS_LENS_BRANCH_ID]: SaratogaAnalysisLens | null;
}

export type BranchChoiceFor<Id extends BranchId> = NonNullable<
  BranchChoices[Id]
>;

export interface BranchState {
  readonly version: typeof BRANCH_STATE_VERSION;
  readonly choices: Readonly<BranchChoices>;
}

export type StoryEntryMode =
  | "chapter-transition"
  | "resume"
  | "chapter-select"
  | "restart";

export interface BranchStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const BRANCH_PRESENTATION_CONTEXTS = [
  "tea-party-break-chest-choice",
  "tea-party-sweep-deck-choice",
  "lexington-deck-duty-acknowledgement",
  "delaware-pole-choice",
  "delaware-clear-ice-choice",
  "trenton-duty-callback",
  "trenton-common",
  "saratoga-river-road-choice",
  "saratoga-supply-line-choice",
  "valley-forge-analysis-acknowledgement",
  "out-of-range",
] as const;
export type BranchPresentationContext =
  (typeof BRANCH_PRESENTATION_CONTEXTS)[number];

export const BRANCH_ACTION_LABELS = {
  teaPartyBreakChest: "Break a chest",
  teaPartySweepDeck: "Sweep the deck",
  delawarePole: "Pole from the bow",
  delawareClearIce: "Clear ice from the hull",
  trentonPoleCallback: "Close the column",
  trentonClearIceCallback: "Clear the gun path",
  trentonCommon: "Advance",
  saratogaRiverRoad: "Trace the river road",
  saratogaSupplyLine: "Inspect the supply line",
  valleyForgeRiverRoadCallback: "Listen for the drill cadence",
  valleyForgeSupplyLineCallback: "Inspect the supply breakdown",
} as const;
export type BranchActionLabel =
  (typeof BRANCH_ACTION_LABELS)[keyof typeof BRANCH_ACTION_LABELS];

export const BRANCH_ACKNOWLEDGEMENTS = {
  lexingtonBreakChest: "At Griffin's Wharf, you chose the hatchet.",
  lexingtonSweepDeck: "At Griffin's Wharf, you chose the broom.",
  trentonPole: "At the crossing, you chose to pole from the bow.",
  trentonClearIce:
    "At the crossing, you chose to clear ice from the hull.",
  valleyForgeRiverRoad: "At Saratoga, you traced the river road.",
  valleyForgeSupplyLine: "At Saratoga, you inspected the supply line.",
} as const;
export type BranchAcknowledgement =
  (typeof BRANCH_ACKNOWLEDGEMENTS)[keyof typeof BRANCH_ACKNOWLEDGEMENTS];

export interface BranchPresentationAction {
  readonly binding: "E";
  readonly label: BranchActionLabel;
  readonly usable: boolean;
}

export interface BranchPresentationState {
  /** @deprecated Delaware-only compatibility metadata; HUDs consume action. */
  readonly selectedDuty: DelawareDuty | null;
  /** Context only. This never enters narration subtitles or audio cues. */
  readonly acknowledgement: BranchAcknowledgement | null;
  readonly action: BranchPresentationAction | null;
}

function neutralChoices(): BranchChoices {
  return {
    [TEA_PARTY_DECK_DUTY_BRANCH_ID]: null,
    [DELAWARE_DUTY_BRANCH_ID]: null,
    [SARATOGA_ANALYSIS_LENS_BRANCH_ID]: null,
  };
}

export function createBranchState(): BranchState {
  return {
    version: BRANCH_STATE_VERSION,
    choices: neutralChoices(),
  };
}

function isTeaPartyDeckDuty(value: unknown): value is TeaPartyDeckDuty {
  return TEA_PARTY_DECK_DUTIES.some((duty) => duty === value);
}

function isDelawareDuty(value: unknown): value is DelawareDuty {
  return DELAWARE_DUTIES.some((duty) => duty === value);
}

function isSaratogaAnalysisLens(value: unknown): value is SaratogaAnalysisLens {
  return SARATOGA_ANALYSIS_LENSES.some((lens) => lens === value);
}

function isBranchChoice<Id extends BranchId>(
  branchId: Id,
  value: unknown,
): value is BranchChoiceFor<Id> {
  if (branchId === TEA_PARTY_DECK_DUTY_BRANCH_ID) {
    return isTeaPartyDeckDuty(value);
  }
  if (branchId === DELAWARE_DUTY_BRANCH_ID) return isDelawareDuty(value);
  return isSaratogaAnalysisLens(value);
}

/** A replayed choice replaces only that branch, keeping prior state immutable. */
export function selectBranchChoice<Id extends BranchId>(
  state: BranchState,
  branchId: Id,
  choice: BranchChoiceFor<Id>,
): BranchState {
  if (!isBranchChoice(branchId, choice)) {
    throw new TypeError(
      `Unknown ${branchId} choice: ${String(choice)}`,
    );
  }

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      ...state.choices,
      [branchId]: choice,
    },
  };
}

export function selectTeaPartyDeckDuty(
  state: BranchState,
  duty: TeaPartyDeckDuty,
): BranchState {
  return selectBranchChoice(state, TEA_PARTY_DECK_DUTY_BRANCH_ID, duty);
}

export function selectDelawareDuty(
  state: BranchState,
  duty: DelawareDuty,
): BranchState {
  return selectBranchChoice(state, DELAWARE_DUTY_BRANCH_ID, duty);
}

export function selectSaratogaAnalysisLens(
  state: BranchState,
  lens: SaratogaAnalysisLens,
): BranchState {
  return selectBranchChoice(state, SARATOGA_ANALYSIS_LENS_BRANCH_ID, lens);
}

export function getBranchChoice<Id extends BranchId>(
  state: BranchState,
  branchId: Id,
): BranchChoices[Id] {
  return state.choices[branchId];
}

export function getTeaPartyDeckDuty(
  state: BranchState,
): TeaPartyDeckDuty | null {
  return getBranchChoice(state, TEA_PARTY_DECK_DUTY_BRANCH_ID);
}

export function getDelawareDuty(state: BranchState): DelawareDuty | null {
  return getBranchChoice(state, DELAWARE_DUTY_BRANCH_ID);
}

export function getSaratogaAnalysisLens(
  state: BranchState,
): SaratogaAnalysisLens | null {
  return getBranchChoice(state, SARATOGA_ANALYSIS_LENS_BRANCH_ID);
}

function action(
  label: BranchActionLabel,
  usable: boolean,
): BranchPresentationAction {
  return { binding: "E", label, usable };
}

/**
 * Typed handoff for the control HUD. This is presentation data, not subtitle
 * content; the HUD owns rendering, focus, and accessibility behavior.
 */
export function getBranchPresentation(
  state: BranchState,
  context: BranchPresentationContext,
  usable = true,
): BranchPresentationState {
  const selectedDuty = getDelawareDuty(state);
  let acknowledgement: BranchAcknowledgement | null = null;
  let branchAction: BranchPresentationAction | null = null;

  if (context === "tea-party-break-chest-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.teaPartyBreakChest, usable);
  }
  if (context === "tea-party-sweep-deck-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.teaPartySweepDeck, usable);
  }
  if (context === "lexington-deck-duty-acknowledgement") {
    const duty = getTeaPartyDeckDuty(state);
    if (duty === "break-chest") {
      acknowledgement = BRANCH_ACKNOWLEDGEMENTS.lexingtonBreakChest;
    }
    if (duty === "sweep-deck") {
      acknowledgement = BRANCH_ACKNOWLEDGEMENTS.lexingtonSweepDeck;
    }
  }

  if (context === "delaware-pole-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.delawarePole, usable);
  }
  if (context === "delaware-clear-ice-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.delawareClearIce, usable);
  }
  if (context === "trenton-duty-callback" && selectedDuty === "pole") {
    acknowledgement = BRANCH_ACKNOWLEDGEMENTS.trentonPole;
    branchAction = action(BRANCH_ACTION_LABELS.trentonPoleCallback, usable);
  }
  if (context === "trenton-duty-callback" && selectedDuty === "clear-ice") {
    acknowledgement = BRANCH_ACKNOWLEDGEMENTS.trentonClearIce;
    branchAction = action(BRANCH_ACTION_LABELS.trentonClearIceCallback, usable);
  }
  if (context === "trenton-common") {
    branchAction = action(BRANCH_ACTION_LABELS.trentonCommon, usable);
  }

  if (context === "saratoga-river-road-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.saratogaRiverRoad, usable);
  }
  if (context === "saratoga-supply-line-choice") {
    branchAction = action(BRANCH_ACTION_LABELS.saratogaSupplyLine, usable);
  }
  if (context === "valley-forge-analysis-acknowledgement") {
    const lens = getSaratogaAnalysisLens(state);
    if (lens === "trace-river-road") {
      acknowledgement = BRANCH_ACKNOWLEDGEMENTS.valleyForgeRiverRoad;
      branchAction = action(
        BRANCH_ACTION_LABELS.valleyForgeRiverRoadCallback,
        usable,
      );
    }
    if (lens === "inspect-supply-line") {
      acknowledgement = BRANCH_ACKNOWLEDGEMENTS.valleyForgeSupplyLine;
      branchAction = action(
        BRANCH_ACTION_LABELS.valleyForgeSupplyLineCallback,
        usable,
      );
    }
  }

  return {
    selectedDuty,
    acknowledgement,
    action: branchAction,
  };
}

function copyBranchState(state: BranchState): BranchState {
  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      [TEA_PARTY_DECK_DUTY_BRANCH_ID]:
        state.choices[TEA_PARTY_DECK_DUTY_BRANCH_ID],
      [DELAWARE_DUTY_BRANCH_ID]: state.choices[DELAWARE_DUTY_BRANCH_ID],
      [SARATOGA_ANALYSIS_LENS_BRANCH_ID]:
        state.choices[SARATOGA_ANALYSIS_LENS_BRANCH_ID],
    },
  };
}

/**
 * Transitions, resume, and chapter select preserve every choice. A full story
 * restart is the only navigation mode that returns a neutral record.
 */
export function branchStateForEntry(
  state: BranchState,
  mode: StoryEntryMode,
): BranchState {
  if (mode === "restart") return createBranchState();
  return copyBranchState(state);
}

export function encodeBranchState(state: BranchState): string {
  return JSON.stringify(copyBranchState(state));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeLegacyChoices(value: unknown): BranchState {
  if (!isRecord(value)) return createBranchState();

  const duty = value[DELAWARE_DUTY_BRANCH_ID];
  if (duty !== null && !isDelawareDuty(duty)) return createBranchState();

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      ...neutralChoices(),
      [DELAWARE_DUTY_BRANCH_ID]: duty,
    },
  };
}

function decodeCurrentChoices(value: unknown): BranchState {
  if (!isRecord(value)) return createBranchState();

  const teaPartyDuty = value[TEA_PARTY_DECK_DUTY_BRANCH_ID];
  const delawareDuty = value[DELAWARE_DUTY_BRANCH_ID];
  const saratogaLens = value[SARATOGA_ANALYSIS_LENS_BRANCH_ID];
  if (
    (teaPartyDuty !== null && !isTeaPartyDeckDuty(teaPartyDuty)) ||
    (delawareDuty !== null && !isDelawareDuty(delawareDuty)) ||
    (saratogaLens !== null && !isSaratogaAnalysisLens(saratogaLens))
  ) {
    return createBranchState();
  }

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      [TEA_PARTY_DECK_DUTY_BRANCH_ID]: teaPartyDuty,
      [DELAWARE_DUTY_BRANCH_ID]: delawareDuty,
      [SARATOGA_ANALYSIS_LENS_BRANCH_ID]: saratogaLens,
    },
  };
}

export function decodeBranchState(raw: string | null): BranchState {
  if (raw === null) return createBranchState();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return createBranchState();

    if (parsed.version === LEGACY_BRANCH_STATE_VERSION) {
      return decodeLegacyChoices(parsed.choices);
    }
    if (parsed.version === BRANCH_STATE_VERSION) {
      return decodeCurrentChoices(parsed.choices);
    }
    return createBranchState();
  } catch {
    return createBranchState();
  }
}

export function loadBranchState(
  storage: Pick<BranchStateStorage, "getItem">,
): BranchState {
  try {
    return decodeBranchState(storage.getItem(BRANCH_STATE_STORAGE_KEY));
  } catch {
    return createBranchState();
  }
}

export function saveBranchState(
  storage: Pick<BranchStateStorage, "setItem">,
  state: BranchState,
): void {
  storage.setItem(BRANCH_STATE_STORAGE_KEY, encodeBranchState(state));
}

/** Clear durable branch data when the full story is restarted. */
export function resetBranchState(
  storage: Pick<BranchStateStorage, "removeItem">,
): BranchState {
  storage.removeItem(BRANCH_STATE_STORAGE_KEY);
  return createBranchState();
}
