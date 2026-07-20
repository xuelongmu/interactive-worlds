import {
  applyBranchRuntimeEvent,
  BRANCH_ACTION_MAPPINGS,
  createBranchChoiceLatch,
  getBranchPresentation,
  loadBranchState,
  saveBranchState,
  resetBranchState,
  type BranchChoiceId,
  type BranchChoiceLatch,
  type BranchCommandErrorEvent,
  type BranchConfirmationEvent,
  type BranchPresentationContext,
  type BranchPresentationStateV2,
  type BranchRequestId,
  type BranchRuntimeEvent,
  type BranchRuntimeHandoff,
  type BranchState,
  type BranchStateStorage,
} from "../branch-state";
import type { ContextualChoiceRequestResult } from "./types";

export interface BranchRuntimeReadiness {
  readonly sessionConfirmed: boolean;
  readonly imageConfirmed: boolean;
  readonly promptConfirmed: boolean;
  readonly inputConfirmed: boolean;
}

export interface BranchRuntimeCommandError {
  readonly momentId: import("../branch-state").BranchMomentId;
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchRequestId;
  readonly message: string;
  readonly visible: true;
  readonly retryable: true;
}

export interface BranchRuntimeSnapshot {
  readonly kind: "branch-runtime-v2";
  readonly presentation: BranchPresentationStateV2;
  readonly readiness: BranchRuntimeReadiness;
  readonly ready: boolean;
  readonly pendingRequestId: BranchRequestId | null;
  readonly commandError: BranchRuntimeCommandError | null;
  readonly lastHandoff: BranchRuntimeHandoff | null;
  readonly revision: number;
}

export interface BranchActionRequest {
  readonly momentId: import("../branch-state").BranchMomentId;
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchRequestId;
}

export type BranchActionRequestResult = ContextualChoiceRequestResult;

export type BranchCommandSender = (request: BranchActionRequest) => void | Promise<void>;

const NOT_READY: BranchRuntimeReadiness = Object.freeze({
  sessionConfirmed: false,
  imageConfirmed: false,
  promptConfirmed: false,
  inputConfirmed: false,
});

function allReady(readiness: BranchRuntimeReadiness): boolean {
  return readiness.sessionConfirmed
    && readiness.imageConfirmed
    && readiness.promptConfirmed
    && readiness.inputConfirmed;
}

function mappingForRequest(request: BranchActionRequest) {
  return BRANCH_ACTION_MAPPINGS.find((mapping) =>
    mapping.momentId === request.momentId
    && mapping.choiceId === request.choiceId
    && mapping.requestId === request.requestId
  ) ?? null;
}

/**
 * Stateful runtime edge around the pure v2 branch contract. Requests only
 * send commands. Durable state changes exclusively through normalized
 * confirmation events from the renderer/backend.
 */
export class BranchRuntimeController {
  private readonly storage: BranchStateStorage;
  private readonly publish: (snapshot: BranchRuntimeSnapshot) => void;
  private state: BranchState;
  private context: BranchPresentationContext = "out-of-range";
  private latch: BranchChoiceLatch | null = null;
  private readiness: BranchRuntimeReadiness = NOT_READY;
  private pendingRequestId: BranchRequestId | null = null;
  private commandError: BranchRuntimeCommandError | null = null;
  private lastHandoff: BranchRuntimeHandoff | null = null;
  private revision = 0;
  private sender: BranchCommandSender | null = null;

  constructor(
    storage: BranchStateStorage,
    publish: (snapshot: BranchRuntimeSnapshot) => void = () => {},
  ) {
    this.storage = storage;
    this.publish = publish;
    this.state = loadBranchState(storage);
  }

  enter(context: BranchPresentationContext, sender: BranchCommandSender | null = null): BranchRuntimeSnapshot {
    this.context = context;
    const momentId = getBranchPresentation(this.state, context).momentId;
    this.latch = momentId === null ? null : createBranchChoiceLatch(momentId);
    this.sender = sender;
    this.readiness = NOT_READY;
    this.pendingRequestId = null;
    this.commandError = null;
    this.lastHandoff = null;
    return this.commit();
  }

  setSender(sender: BranchCommandSender | null): BranchRuntimeSnapshot {
    this.sender = sender;
    return this.commit();
  }

  setReadiness(readiness: BranchRuntimeReadiness): BranchRuntimeSnapshot {
    this.readiness = Object.freeze({ ...readiness });
    return this.commit();
  }

  clearTransient(): BranchRuntimeSnapshot {
    this.pendingRequestId = null;
    this.commandError = null;
    this.lastHandoff = null;
    this.readiness = NOT_READY;
    return this.commit();
  }

  restartStory(): BranchRuntimeSnapshot {
    this.state = resetBranchState(this.storage);
    const momentId = getBranchPresentation(this.state, this.context).momentId;
    this.latch = momentId === null ? null : createBranchChoiceLatch(momentId);
    this.pendingRequestId = null;
    this.commandError = null;
    this.lastHandoff = null;
    this.readiness = NOT_READY;
    return this.commit();
  }

  async request(request: BranchActionRequest): Promise<BranchActionRequestResult> {
    const mapping = mappingForRequest(request);
    const presentation = this.snapshot().presentation;
    if (!mapping || mapping.momentId !== presentation.momentId) {
      return { status: "invalid", requestId: request.requestId ?? null, message: "Action does not belong to the active branch moment." };
    }
    if (this.latch?.latchedChoiceId !== null) {
      return { status: "already-latched", requestId: request.requestId };
    }
    if (!allReady(this.readiness) || !this.sender) {
      return { status: "unavailable", requestId: request.requestId };
    }
    if (this.pendingRequestId !== null) {
      return { status: "duplicate", requestId: request.requestId };
    }

    this.pendingRequestId = request.requestId;
    this.commandError = null;
    this.lastHandoff = null;
    this.commit();
    try {
      await this.sender(request);
    } catch (error) {
      this.handle({
        type: "command_error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return { status: "requested", requestId: request.requestId };
  }

  handle(event: BranchRuntimeEvent): BranchRuntimeSnapshot {
    if (!this.latch) return this.snapshot();
    const duplicateConfirmation = event.type === "branch-confirmed"
      && this.latch.latchedChoiceId !== null
      && this.latch.requestId === event.requestId;
    if (event.requestId !== this.pendingRequestId && !duplicateConfirmation) {
      return this.snapshot();
    }

    const result = applyBranchRuntimeEvent(this.state, this.latch, event);
    this.state = result.state;
    this.latch = result.latch;
    this.lastHandoff = result.handoff;
    if (result.handoff.outcome === "latched") {
      saveBranchState(this.storage, this.state);
      this.pendingRequestId = null;
      this.commandError = null;
    } else if (result.handoff.outcome === "command_error") {
      this.pendingRequestId = null;
      this.commandError = {
        momentId: result.handoff.momentId,
        choiceId: result.handoff.choiceId,
        requestId: result.handoff.requestId,
        ...result.handoff.error,
      };
    }
    return this.commit();
  }

  confirm(event: BranchConfirmationEvent): BranchRuntimeSnapshot {
    return this.handle(event);
  }

  reject(event: BranchCommandErrorEvent): BranchRuntimeSnapshot {
    return this.handle(event);
  }

  snapshot(): BranchRuntimeSnapshot {
    const ready = allReady(this.readiness);
    return Object.freeze({
      kind: "branch-runtime-v2",
      presentation: getBranchPresentation(this.state, this.context, {
        usable: ready && this.pendingRequestId === null && this.latch?.latchedChoiceId === null,
        latch: this.latch,
      }),
      readiness: this.readiness,
      ready,
      pendingRequestId: this.pendingRequestId,
      commandError: this.commandError,
      lastHandoff: this.lastHandoff,
      revision: this.revision,
    });
  }

  private commit(): BranchRuntimeSnapshot {
    this.revision += 1;
    const snapshot = this.snapshot();
    this.publish(snapshot);
    return snapshot;
  }
}
