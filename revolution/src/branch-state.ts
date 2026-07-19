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
export const TRENTON_PERSPECTIVE_BRANCH_ID = "trenton-perspective" as const;
export const SARATOGA_ANALYSIS_LENS_BRANCH_ID = "saratoga-analysis-lens" as const;

/** Chronological order is also the canonical encoded property order. */
export const BRANCH_MOMENT_IDS = [
  TEA_PARTY_DECK_DUTY_BRANCH_ID,
  DELAWARE_DUTY_BRANCH_ID,
  TRENTON_PERSPECTIVE_BRANCH_ID,
  SARATOGA_ANALYSIS_LENS_BRANCH_ID,
] as const;
export const BRANCH_IDS = BRANCH_MOMENT_IDS;
export type BranchMomentId = (typeof BRANCH_MOMENT_IDS)[number];
export type BranchId = BranchMomentId;

export const TEA_PARTY_DECK_DUTIES = ["break-chest", "sweep-deck"] as const;
export type TeaPartyDeckDuty = (typeof TEA_PARTY_DECK_DUTIES)[number];

export const DELAWARE_DUTIES = ["pole", "clear-ice"] as const;
export type DelawareDuty = (typeof DELAWARE_DUTIES)[number];

export const TRENTON_PERSPECTIVES = [
  "stay-with-column",
  "move-toward-guns",
] as const;
export type TrentonPerspective = (typeof TRENTON_PERSPECTIVES)[number];

export const SARATOGA_ANALYSIS_LENSES = [
  "trace-river-road",
  "inspect-supply-line",
] as const;
export type SaratogaAnalysisLens = (typeof SARATOGA_ANALYSIS_LENSES)[number];

export interface BranchChoices {
  readonly [TEA_PARTY_DECK_DUTY_BRANCH_ID]: TeaPartyDeckDuty | null;
  readonly [DELAWARE_DUTY_BRANCH_ID]: DelawareDuty | null;
  readonly [TRENTON_PERSPECTIVE_BRANCH_ID]: TrentonPerspective | null;
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

/**
 * Stable, declarative identities shared with later runtime integration. Input
 * never confirms a choice: only the matching backend confirmation event does.
 */
export const BRANCH_ACTION_MAPPINGS = [
  {
    momentId: TEA_PARTY_DECK_DUTY_BRANCH_ID,
    choice: "break-chest",
    choiceId: "tea-party-deck-duty.break-chest",
    actionId: "branch-action:tea-party-deck-duty.break-chest",
    requestId: "branch-request:tea-party-deck-duty.break-chest",
    confirmationEventId: "branch-confirmed:tea-party-deck-duty.break-chest",
    binding: "E",
    label: "Break a chest",
  },
  {
    momentId: TEA_PARTY_DECK_DUTY_BRANCH_ID,
    choice: "sweep-deck",
    choiceId: "tea-party-deck-duty.sweep-deck",
    actionId: "branch-action:tea-party-deck-duty.sweep-deck",
    requestId: "branch-request:tea-party-deck-duty.sweep-deck",
    confirmationEventId: "branch-confirmed:tea-party-deck-duty.sweep-deck",
    binding: "F",
    label: "Sweep the deck",
  },
  {
    momentId: DELAWARE_DUTY_BRANCH_ID,
    choice: "pole",
    choiceId: "delaware-duty.pole",
    actionId: "branch-action:delaware-duty.pole",
    requestId: "branch-request:delaware-duty.pole",
    confirmationEventId: "branch-confirmed:delaware-duty.pole",
    binding: "E",
    label: "Pole from the bow",
  },
  {
    momentId: DELAWARE_DUTY_BRANCH_ID,
    choice: "clear-ice",
    choiceId: "delaware-duty.clear-ice",
    actionId: "branch-action:delaware-duty.clear-ice",
    requestId: "branch-request:delaware-duty.clear-ice",
    confirmationEventId: "branch-confirmed:delaware-duty.clear-ice",
    binding: "F",
    label: "Clear ice from the hull",
  },
  {
    momentId: TRENTON_PERSPECTIVE_BRANCH_ID,
    choice: "stay-with-column",
    choiceId: "trenton-perspective.stay-with-column",
    actionId: "branch-action:trenton-perspective.stay-with-column",
    requestId: "branch-request:trenton-perspective.stay-with-column",
    confirmationEventId: "branch-confirmed:trenton-perspective.stay-with-column",
    binding: "E",
    label: "Stay with the column",
  },
  {
    momentId: TRENTON_PERSPECTIVE_BRANCH_ID,
    choice: "move-toward-guns",
    choiceId: "trenton-perspective.move-toward-guns",
    actionId: "branch-action:trenton-perspective.move-toward-guns",
    requestId: "branch-request:trenton-perspective.move-toward-guns",
    confirmationEventId: "branch-confirmed:trenton-perspective.move-toward-guns",
    binding: "F",
    label: "Move toward the guns",
  },
  {
    momentId: SARATOGA_ANALYSIS_LENS_BRANCH_ID,
    choice: "trace-river-road",
    choiceId: "saratoga-analysis-lens.trace-river-road",
    actionId: "branch-action:saratoga-analysis-lens.trace-river-road",
    requestId: "branch-request:saratoga-analysis-lens.trace-river-road",
    confirmationEventId: "branch-confirmed:saratoga-analysis-lens.trace-river-road",
    binding: "E",
    label: "Trace the river road",
  },
  {
    momentId: SARATOGA_ANALYSIS_LENS_BRANCH_ID,
    choice: "inspect-supply-line",
    choiceId: "saratoga-analysis-lens.inspect-supply-line",
    actionId: "branch-action:saratoga-analysis-lens.inspect-supply-line",
    requestId: "branch-request:saratoga-analysis-lens.inspect-supply-line",
    confirmationEventId: "branch-confirmed:saratoga-analysis-lens.inspect-supply-line",
    binding: "F",
    label: "Inspect the supply line",
  },
] as const;

export type BranchActionMapping = (typeof BRANCH_ACTION_MAPPINGS)[number];
export type BranchChoiceId = BranchActionMapping["choiceId"];
export type BranchActionId = BranchActionMapping["actionId"];
export type BranchRequestId = BranchActionMapping["requestId"];
export type BranchConfirmationEventId =
  BranchActionMapping["confirmationEventId"];
export type BranchActionLabel = BranchActionMapping["label"];

export const BRANCH_OBJECTIVES = {
  [TEA_PARTY_DECK_DUTY_BRANCH_ID]: "Choose your first deck duty.",
  [DELAWARE_DUTY_BRANCH_ID]: "Choose your duty for the crossing.",
  [TRENTON_PERSPECTIVE_BRANCH_ID]: "Choose where to advance.",
  [SARATOGA_ANALYSIS_LENS_BRANCH_ID]: "Choose how to study the campaign.",
} as const;
export type BranchObjective =
  (typeof BRANCH_OBJECTIVES)[keyof typeof BRANCH_OBJECTIVES];

export const BRANCH_ACKNOWLEDGEMENTS = {
  "tea-party-deck-duty.break-chest":
    "At Griffin's Wharf, you chose the hatchet.",
  "tea-party-deck-duty.sweep-deck":
    "At Griffin's Wharf, you chose the broom.",
  "delaware-duty.pole":
    "At the crossing, you chose to pole from the bow.",
  "delaware-duty.clear-ice":
    "At the crossing, you chose to clear ice from the hull.",
  "trenton-perspective.stay-with-column":
    "At Trenton, you stayed with the column.",
  "trenton-perspective.move-toward-guns":
    "At Trenton, you moved toward the guns.",
  "saratoga-analysis-lens.trace-river-road":
    "At Saratoga, you traced the river road.",
  "saratoga-analysis-lens.inspect-supply-line":
    "At Saratoga, you inspected the supply line.",
} as const satisfies Readonly<Record<BranchChoiceId, string>>;
export type BranchAcknowledgement =
  (typeof BRANCH_ACKNOWLEDGEMENTS)[keyof typeof BRANCH_ACKNOWLEDGEMENTS];

export const BRANCH_SELECTION_ACKNOWLEDGEMENTS = {
  "tea-party-deck-duty.break-chest": "Deck duty confirmed: break a chest.",
  "tea-party-deck-duty.sweep-deck": "Deck duty confirmed: sweep the deck.",
  "delaware-duty.pole": "Crossing duty confirmed: pole from the bow.",
  "delaware-duty.clear-ice": "Crossing duty confirmed: clear ice.",
  "trenton-perspective.stay-with-column":
    "Trenton perspective confirmed: stay with the column.",
  "trenton-perspective.move-toward-guns":
    "Trenton perspective confirmed: move toward the guns.",
  "saratoga-analysis-lens.trace-river-road":
    "Saratoga lens confirmed: trace the river road.",
  "saratoga-analysis-lens.inspect-supply-line":
    "Saratoga lens confirmed: inspect the supply line.",
} as const satisfies Readonly<Record<BranchChoiceId, string>>;
export type BranchSelectionAcknowledgement =
  (typeof BRANCH_SELECTION_ACKNOWLEDGEMENTS)[keyof typeof BRANCH_SELECTION_ACKNOWLEDGEMENTS];

export const BRANCH_PRESENTATION_CONTEXTS = [
  "tea-party-deck-duty-choice",
  "lexington-deck-duty-acknowledgement",
  "delaware-duty-choice",
  "trenton-perspective-choice",
  "saratoga-analysis-lens-choice",
  "valley-forge-analysis-acknowledgement",
  "out-of-range",
] as const;
export type BranchPresentationContext =
  (typeof BRANCH_PRESENTATION_CONTEXTS)[number];

export interface BranchPresentationAction {
  readonly id: BranchActionId;
  readonly momentId: BranchMomentId;
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchRequestId;
  readonly confirmationEventId: BranchConfirmationEventId;
  readonly binding: "E" | "F";
  readonly label: BranchActionLabel;
  readonly usable: boolean;
}

export type BranchPresentationActions = readonly [
  BranchPresentationAction & { readonly binding: "E" },
  BranchPresentationAction & { readonly binding: "F" },
];

export interface BranchChoiceLatch {
  readonly momentId: BranchMomentId;
  readonly latchedChoiceId: BranchChoiceId | null;
  readonly requestId: BranchRequestId | null;
}

export interface BranchPresentationOptions {
  /** Readiness belongs to runtime. The neutral contract default is false. */
  readonly usable?: boolean;
  readonly latch?: BranchChoiceLatch | null;
}

export interface BranchPresentationStateV2 {
  readonly kind: "branch-presentation-v2";
  readonly context: BranchPresentationContext;
  readonly momentId: BranchMomentId | null;
  readonly objective: BranchObjective | null;
  readonly actions: BranchPresentationActions | null;
  readonly selectedChoiceId: BranchChoiceId | null;
  readonly latchedChoiceId: BranchChoiceId | null;
  readonly acknowledgement: BranchAcknowledgement | null;
  /** Compile-only compatibility seam; the v2 presentation never emits it. */
  readonly action?: never;
  readonly selectedDuty?: never;
}

interface LegacyBranchPresentationAction {
  readonly binding: "E";
  readonly label:
    | "Pole from the bow"
    | "Clear ice from the hull"
    | "Close the column"
    | "Clear the gun path"
    | "Advance";
  readonly usable: boolean;
}

/**
 * Temporary compile-only shape for the separately owned engine/HUD seam.
 * getBranchPresentation never returns this legacy singular-action variant.
 */
interface LegacyBranchPresentationState {
  readonly kind?: never;
  readonly context?: never;
  readonly momentId?: never;
  readonly objective?: never;
  readonly actions?: never;
  readonly selectedChoiceId?: never;
  readonly latchedChoiceId?: never;
  readonly selectedDuty: DelawareDuty | null;
  readonly acknowledgement: BranchAcknowledgement | null;
  readonly action: LegacyBranchPresentationAction | null;
}

export type BranchPresentationState =
  | BranchPresentationStateV2
  | LegacyBranchPresentationState;

export interface BranchConfirmationEvent {
  readonly type: "branch-confirmed";
  readonly id: BranchConfirmationEventId;
  readonly requestId: BranchRequestId;
}

export const BRANCH_COMMAND_ERROR_EVENT = "command_error" as const;
export const BRANCH_COMMAND_ERROR_MESSAGE =
  "The action was not confirmed. Try again." as const;

export interface BranchCommandErrorEvent {
  readonly type: typeof BRANCH_COMMAND_ERROR_EVENT;
  readonly requestId: BranchRequestId;
  readonly message?: string;
}

export type BranchRuntimeEvent =
  | BranchConfirmationEvent
  | BranchCommandErrorEvent;

export type BranchRuntimeHandoff =
  | Readonly<{
      outcome: "latched";
      momentId: BranchMomentId;
      actionId: BranchActionId;
      choiceId: BranchChoiceId;
      requestId: BranchRequestId;
      acknowledgement: BranchSelectionAcknowledgement;
      error: null;
    }>
  | Readonly<{
      outcome: "ignored";
      momentId: BranchMomentId;
      actionId: BranchActionId;
      choiceId: BranchChoiceId;
      requestId: BranchRequestId;
      acknowledgement: null;
      error: null;
    }>
  | Readonly<{
      outcome: "command_error";
      momentId: BranchMomentId;
      actionId: BranchActionId;
      choiceId: BranchChoiceId;
      requestId: BranchRequestId;
      acknowledgement: null;
      error: Readonly<{
        message: string;
        visible: true;
        retryable: true;
      }>;
    }>;

export interface BranchRuntimeEventResult {
  readonly state: BranchState;
  readonly latch: BranchChoiceLatch;
  readonly handoff: BranchRuntimeHandoff;
}

function neutralChoices(): BranchChoices {
  return {
    [TEA_PARTY_DECK_DUTY_BRANCH_ID]: null,
    [DELAWARE_DUTY_BRANCH_ID]: null,
    [TRENTON_PERSPECTIVE_BRANCH_ID]: null,
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

function isTrentonPerspective(value: unknown): value is TrentonPerspective {
  return TRENTON_PERSPECTIVES.some((perspective) => perspective === value);
}

function isSaratogaAnalysisLens(value: unknown): value is SaratogaAnalysisLens {
  return SARATOGA_ANALYSIS_LENSES.some((lens) => lens === value);
}

function isBranchId(value: unknown): value is BranchId {
  return BRANCH_IDS.some((branchId) => branchId === value);
}

function isBranchChoice<Id extends BranchId>(
  branchId: Id,
  value: unknown,
): value is BranchChoiceFor<Id> {
  if (branchId === TEA_PARTY_DECK_DUTY_BRANCH_ID) {
    return isTeaPartyDeckDuty(value);
  }
  if (branchId === DELAWARE_DUTY_BRANCH_ID) return isDelawareDuty(value);
  if (branchId === TRENTON_PERSPECTIVE_BRANCH_ID) {
    return isTrentonPerspective(value);
  }
  if (branchId === SARATOGA_ANALYSIS_LENS_BRANCH_ID) {
    return isSaratogaAnalysisLens(value);
  }
  return false;
}

/** A replayed choice replaces only that branch, keeping prior state immutable. */
export function selectBranchChoice<Id extends BranchId>(
  state: BranchState,
  branchId: Id,
  choice: BranchChoiceFor<Id>,
): BranchState {
  if (!isBranchId(branchId)) {
    throw new TypeError(`Unknown branch id: ${String(branchId)}`);
  }
  if (!isBranchChoice(branchId, choice)) {
    throw new TypeError(`Unknown ${branchId} choice: ${String(choice)}`);
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

export function selectTrentonPerspective(
  state: BranchState,
  perspective: TrentonPerspective,
): BranchState {
  return selectBranchChoice(state, TRENTON_PERSPECTIVE_BRANCH_ID, perspective);
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

export function getTrentonPerspective(
  state: BranchState,
): TrentonPerspective | null {
  return getBranchChoice(state, TRENTON_PERSPECTIVE_BRANCH_ID);
}

export function getSaratogaAnalysisLens(
  state: BranchState,
): SaratogaAnalysisLens | null {
  return getBranchChoice(state, SARATOGA_ANALYSIS_LENS_BRANCH_ID);
}

export function createBranchChoiceLatch(
  momentId: BranchMomentId,
): BranchChoiceLatch {
  if (!isBranchId(momentId)) {
    throw new TypeError(`Unknown branch moment: ${String(momentId)}`);
  }
  return { momentId, latchedChoiceId: null, requestId: null };
}

function mappingForChoice(
  momentId: BranchMomentId,
  choice: BranchChoices[BranchMomentId],
): BranchActionMapping | null {
  if (choice === null) return null;
  return (
    BRANCH_ACTION_MAPPINGS.find(
      (mapping) =>
        mapping.momentId === momentId && mapping.choice === choice,
    ) ?? null
  );
}

function mappingForRequest(requestId: unknown): BranchActionMapping | null {
  return (
    BRANCH_ACTION_MAPPINGS.find(
      (mapping) => mapping.requestId === requestId,
    ) ?? null
  );
}

function mappingForConfirmation(
  eventId: unknown,
): BranchActionMapping | null {
  return (
    BRANCH_ACTION_MAPPINGS.find(
      (mapping) => mapping.confirmationEventId === eventId,
    ) ?? null
  );
}

function choicesForMoment(
  state: BranchState,
  momentId: BranchMomentId,
): BranchChoiceId | null {
  return mappingForChoice(momentId, state.choices[momentId])?.choiceId ?? null;
}

function presentationActions(
  momentId: BranchMomentId,
  usable: boolean,
): BranchPresentationActions {
  const mappings = BRANCH_ACTION_MAPPINGS.filter(
    (mapping) => mapping.momentId === momentId,
  );
  const e = mappings.find((mapping) => mapping.binding === "E");
  const f = mappings.find((mapping) => mapping.binding === "F");
  if (!e || !f) throw new TypeError(`Incomplete action mapping: ${momentId}`);

  const toAction = (mapping: BranchActionMapping): BranchPresentationAction => ({
    id: mapping.actionId,
    momentId: mapping.momentId,
    choiceId: mapping.choiceId,
    requestId: mapping.requestId,
    confirmationEventId: mapping.confirmationEventId,
    binding: mapping.binding,
    label: mapping.label,
    usable,
  });
  return Object.freeze([
    Object.freeze(toAction(e)),
    Object.freeze(toAction(f)),
  ]) as BranchPresentationActions;
}

function callbackAcknowledgement(
  state: BranchState,
  momentId: BranchMomentId,
): BranchAcknowledgement | null {
  const choiceId = choicesForMoment(state, momentId);
  return choiceId === null ? null : BRANCH_ACKNOWLEDGEMENTS[choiceId];
}

function momentForContext(
  context: BranchPresentationContext,
): BranchMomentId | null {
  if (context === "tea-party-deck-duty-choice") {
    return TEA_PARTY_DECK_DUTY_BRANCH_ID;
  }
  if (context === "delaware-duty-choice") return DELAWARE_DUTY_BRANCH_ID;
  if (context === "trenton-perspective-choice") {
    return TRENTON_PERSPECTIVE_BRANCH_ID;
  }
  if (context === "saratoga-analysis-lens-choice") {
    return SARATOGA_ANALYSIS_LENS_BRANCH_ID;
  }
  return null;
}

/**
 * Exact presentation handoff. Choice moments always expose both E and F;
 * callback-only and out-of-range contexts expose no actions.
 */
export function getBranchPresentation(
  state: BranchState,
  context: BranchPresentationContext,
  options: BranchPresentationOptions = {},
): BranchPresentationStateV2 {
  const momentId = momentForContext(context);
  const latch = options.latch ?? null;
  if (latch !== null && latch.momentId !== momentId) {
    throw new TypeError(
      `Latch moment ${latch.momentId} does not match presentation ${String(momentId)}`,
    );
  }

  let acknowledgement: BranchAcknowledgement | null = null;
  if (context === "lexington-deck-duty-acknowledgement") {
    acknowledgement = callbackAcknowledgement(
      state,
      TEA_PARTY_DECK_DUTY_BRANCH_ID,
    );
  }
  if (context === "trenton-perspective-choice") {
    acknowledgement = callbackAcknowledgement(state, DELAWARE_DUTY_BRANCH_ID);
  }
  if (context === "saratoga-analysis-lens-choice") {
    acknowledgement = callbackAcknowledgement(
      state,
      TRENTON_PERSPECTIVE_BRANCH_ID,
    );
  }
  if (context === "valley-forge-analysis-acknowledgement") {
    acknowledgement = callbackAcknowledgement(
      state,
      SARATOGA_ANALYSIS_LENS_BRANCH_ID,
    );
  }

  return {
    kind: "branch-presentation-v2",
    context,
    momentId,
    objective: momentId === null ? null : BRANCH_OBJECTIVES[momentId],
    actions:
      momentId === null
        ? null
        : presentationActions(momentId, options.usable ?? false),
    selectedChoiceId:
      momentId === null ? null : choicesForMoment(state, momentId),
    latchedChoiceId: latch?.latchedChoiceId ?? null,
    acknowledgement,
  };
}

function selectMappedChoice(
  state: BranchState,
  mapping: BranchActionMapping,
): BranchState {
  if (
    mapping.momentId === TEA_PARTY_DECK_DUTY_BRANCH_ID &&
    isTeaPartyDeckDuty(mapping.choice)
  ) {
    return selectTeaPartyDeckDuty(state, mapping.choice);
  }
  if (
    mapping.momentId === DELAWARE_DUTY_BRANCH_ID &&
    isDelawareDuty(mapping.choice)
  ) {
    return selectDelawareDuty(state, mapping.choice);
  }
  if (
    mapping.momentId === TRENTON_PERSPECTIVE_BRANCH_ID &&
    isTrentonPerspective(mapping.choice)
  ) {
    return selectTrentonPerspective(state, mapping.choice);
  }
  if (
    mapping.momentId === SARATOGA_ANALYSIS_LENS_BRANCH_ID &&
    isSaratogaAnalysisLens(mapping.choice)
  ) {
    return selectSaratogaAnalysisLens(state, mapping.choice);
  }
  throw new TypeError(`Invalid action mapping: ${mapping.actionId}`);
}

/**
 * Pure reducer for normalized backend outcomes. Key input creates a request;
 * only a matching branch-confirmed event latches and persists the choice.
 * command_error remains a visible, retryable, non-confirming outcome.
 */
export function applyBranchRuntimeEvent(
  state: BranchState,
  latch: BranchChoiceLatch,
  event: BranchRuntimeEvent,
): BranchRuntimeEventResult {
  const requestMapping = mappingForRequest(event.requestId);
  if (requestMapping === null) {
    throw new TypeError(`Unknown branch request: ${String(event.requestId)}`);
  }
  if (requestMapping.momentId !== latch.momentId) {
    throw new TypeError(
      `Request ${event.requestId} does not belong to ${latch.momentId}`,
    );
  }

  if (event.type === BRANCH_COMMAND_ERROR_EVENT) {
    return {
      state,
      latch,
      handoff: {
        outcome: "command_error",
        momentId: requestMapping.momentId,
        actionId: requestMapping.actionId,
        choiceId: requestMapping.choiceId,
        requestId: requestMapping.requestId,
        acknowledgement: null,
        error: {
          message: event.message?.trim() || BRANCH_COMMAND_ERROR_MESSAGE,
          visible: true,
          retryable: true,
        },
      },
    };
  }

  const confirmationMapping = mappingForConfirmation(event.id);
  if (
    confirmationMapping === null ||
    confirmationMapping.requestId !== event.requestId
  ) {
    throw new TypeError(
      `Confirmation ${String(event.id)} does not match ${event.requestId}`,
    );
  }

  if (latch.latchedChoiceId !== null) {
    return {
      state,
      latch,
      handoff: {
        outcome: "ignored",
        momentId: confirmationMapping.momentId,
        actionId: confirmationMapping.actionId,
        choiceId: confirmationMapping.choiceId,
        requestId: confirmationMapping.requestId,
        acknowledgement: null,
        error: null,
      },
    };
  }

  const nextState = selectMappedChoice(state, confirmationMapping);
  const nextLatch: BranchChoiceLatch = {
    momentId: confirmationMapping.momentId,
    latchedChoiceId: confirmationMapping.choiceId,
    requestId: confirmationMapping.requestId,
  };
  return {
    state: nextState,
    latch: nextLatch,
    handoff: {
      outcome: "latched",
      momentId: confirmationMapping.momentId,
      actionId: confirmationMapping.actionId,
      choiceId: confirmationMapping.choiceId,
      requestId: confirmationMapping.requestId,
      acknowledgement:
        BRANCH_SELECTION_ACKNOWLEDGEMENTS[confirmationMapping.choiceId],
      error: null,
    },
  };
}

function copyBranchState(state: BranchState): BranchState {
  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      [TEA_PARTY_DECK_DUTY_BRANCH_ID]:
        state.choices[TEA_PARTY_DECK_DUTY_BRANCH_ID],
      [DELAWARE_DUTY_BRANCH_ID]: state.choices[DELAWARE_DUTY_BRANCH_ID],
      [TRENTON_PERSPECTIVE_BRANCH_ID]:
        state.choices[TRENTON_PERSPECTIVE_BRANCH_ID],
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
  const trentonPerspective = value[TRENTON_PERSPECTIVE_BRANCH_ID];
  const saratogaLens = value[SARATOGA_ANALYSIS_LENS_BRANCH_ID];
  if (
    (teaPartyDuty !== null && !isTeaPartyDeckDuty(teaPartyDuty)) ||
    (delawareDuty !== null && !isDelawareDuty(delawareDuty)) ||
    (trentonPerspective !== null &&
      !isTrentonPerspective(trentonPerspective)) ||
    (saratogaLens !== null && !isSaratogaAnalysisLens(saratogaLens))
  ) {
    return createBranchState();
  }

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      [TEA_PARTY_DECK_DUTY_BRANCH_ID]: teaPartyDuty,
      [DELAWARE_DUTY_BRANCH_ID]: delawareDuty,
      [TRENTON_PERSPECTIVE_BRANCH_ID]: trentonPerspective,
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
