/**
 * Versioned state for historically convergent player choices.
 *
 * This record is deliberately separate from engine story progress while the
 * director/state integration contract is owned elsewhere. It contains only
 * what the viewer chose to do, never a mutable historical outcome.
 */

export const BRANCH_STATE_STORAGE_KEY = "revolution-branch-state";
export const BRANCH_STATE_VERSION = 1 as const;
export const DELAWARE_DUTY_BRANCH_ID = "delaware-duty" as const;

export const DELAWARE_DUTIES = ["pole", "clear-ice"] as const;
export type DelawareDuty = (typeof DELAWARE_DUTIES)[number];

export interface BranchState {
  readonly version: typeof BRANCH_STATE_VERSION;
  readonly choices: Readonly<{
    [DELAWARE_DUTY_BRANCH_ID]: DelawareDuty | null;
  }>;
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

export type BranchPresentationContext =
  | "delaware-pole-choice"
  | "delaware-clear-ice-choice"
  | "trenton-duty-callback"
  | "trenton-common"
  | "out-of-range";

export interface BranchPresentationAction {
  readonly binding: "E";
  readonly label:
    | "Pole from the bow"
    | "Clear ice from the hull"
    | "Close the column"
    | "Clear the gun path"
    | "Advance";
  readonly usable: boolean;
}

export interface BranchPresentationState {
  readonly selectedDuty: DelawareDuty | null;
  readonly acknowledgement: string | null;
  readonly action: BranchPresentationAction | null;
}

export function createBranchState(): BranchState {
  return {
    version: BRANCH_STATE_VERSION,
    choices: { [DELAWARE_DUTY_BRANCH_ID]: null },
  };
}

function isDelawareDuty(value: unknown): value is DelawareDuty {
  return DELAWARE_DUTIES.some((duty) => duty === value);
}

/** A replayed choice replaces the previous selection, keeping it reversible. */
export function selectDelawareDuty(
  state: BranchState,
  duty: DelawareDuty,
): BranchState {
  if (!isDelawareDuty(duty)) {
    throw new TypeError(`Unknown Delaware duty: ${String(duty)}`);
  }

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      ...state.choices,
      [DELAWARE_DUTY_BRANCH_ID]: duty,
    },
  };
}

export function getDelawareDuty(state: BranchState): DelawareDuty | null {
  return state.choices[DELAWARE_DUTY_BRANCH_ID];
}

/**
 * Typed handoff for the control HUD. This is presentation data, not subtitle
 * content; the HUD owns rendering and focus behavior.
 */
export function getBranchPresentation(
  state: BranchState,
  context: BranchPresentationContext,
  usable = true,
): BranchPresentationState {
  const selectedDuty = getDelawareDuty(state);
  let label: BranchPresentationAction["label"] | null = null;
  let acknowledgement: string | null = null;

  if (context === "delaware-pole-choice") label = "Pole from the bow";
  if (context === "delaware-clear-ice-choice") label = "Clear ice from the hull";
  if (context === "trenton-common") label = "Advance";

  if (context === "trenton-duty-callback" && selectedDuty === "pole") {
    label = "Close the column";
    acknowledgement = "At the crossing, you chose to pole from the bow.";
  }
  if (context === "trenton-duty-callback" && selectedDuty === "clear-ice") {
    label = "Clear the gun path";
    acknowledgement = "At the crossing, you chose to clear ice from the hull.";
  }

  return {
    selectedDuty,
    acknowledgement,
    action: label === null ? null : { binding: "E", label, usable },
  };
}

/**
 * Transitions, resume, and chapter select preserve the choice. A full story
 * restart is the only navigation mode that returns a neutral record.
 */
export function branchStateForEntry(
  state: BranchState,
  mode: StoryEntryMode,
): BranchState {
  if (mode === "restart") return createBranchState();

  return {
    version: BRANCH_STATE_VERSION,
    choices: {
      [DELAWARE_DUTY_BRANCH_ID]: state.choices[DELAWARE_DUTY_BRANCH_ID],
    },
  };
}

export function encodeBranchState(state: BranchState): string {
  return JSON.stringify({
    version: BRANCH_STATE_VERSION,
    choices: {
      [DELAWARE_DUTY_BRANCH_ID]: state.choices[DELAWARE_DUTY_BRANCH_ID],
    },
  });
}

export function decodeBranchState(raw: string | null): BranchState {
  if (raw === null) return createBranchState();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return createBranchState();
    }

    const candidate = parsed as {
      version?: unknown;
      choices?: Record<string, unknown>;
    };
    if (
      candidate.version !== BRANCH_STATE_VERSION ||
      typeof candidate.choices !== "object" ||
      candidate.choices === null
    ) {
      return createBranchState();
    }

    const duty = candidate.choices[DELAWARE_DUTY_BRANCH_ID];
    if (duty === null) return createBranchState();
    if (!isDelawareDuty(duty)) return createBranchState();

    return selectDelawareDuty(createBranchState(), duty);
  } catch {
    return createBranchState();
  }
}

export function loadBranchState(storage: Pick<BranchStateStorage, "getItem">): BranchState {
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
