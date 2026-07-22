import {
  BRANCH_ACTION_MAPPINGS,
  type BranchActionMapping,
  type BranchChoiceId,
  type BranchMomentId,
  type BranchStateStorage,
} from "./branch-state";
import { canonicalNarrativeBeats } from "./engine/beat-navigation";
import {
  BranchRuntimeController,
  type BranchRuntimeSnapshot,
} from "./engine/branch-runtime";
import type { SceneManifest } from "./engine/types";
import { scenes } from "./scenes";

export const SIMULATED_EVIDENCE_LABEL = "DEV / SIMULATED" as const;

export interface MechanicsCueSummary {
  readonly id: string;
  readonly trigger: SceneManifest["cues"][number]["trigger"]["type"];
  readonly target: string | null;
}

export interface MechanicsBranchActionSummary {
  readonly binding: "E" | "F";
  readonly label: BranchActionMapping["label"];
  readonly choiceId: BranchChoiceId;
  readonly requestId: BranchActionMapping["requestId"];
}

export interface PlayableMomentSummary {
  readonly index: number;
  readonly sceneId: string;
  readonly title: string;
  readonly renderer: SceneManifest["renderer"];
  readonly cues: readonly MechanicsCueSummary[];
  readonly zoneIds: readonly string[];
  readonly modelEventNames: readonly string[];
  readonly branchContext: NonNullable<SceneManifest["branching"]>["context"] | null;
  readonly branchActions: readonly MechanicsBranchActionSummary[];
}

function cueTarget(cue: SceneManifest["cues"][number]): string | null {
  return cue.trigger.zone ?? cue.trigger.name ?? null;
}

/** Canonical review catalog derived only from the production manifests. */
export function currentPlayableMoments(
  manifests: readonly SceneManifest[] = scenes,
): readonly PlayableMomentSummary[] {
  const beats = canonicalNarrativeBeats(manifests);
  return Object.freeze(manifests.map((manifest, index) => {
    const authoredChoiceIds = new Set(
      manifest.branching?.actions?.map((action) => action.choiceId) ?? [],
    );
    const branchActions = BRANCH_ACTION_MAPPINGS
      .filter((mapping) => authoredChoiceIds.has(mapping.choiceId))
      .map((mapping) => Object.freeze({
        binding: mapping.binding,
        label: mapping.label,
        choiceId: mapping.choiceId,
        requestId: mapping.requestId,
      }));
    const cueById = new Map(manifest.cues.map((cue) => [cue.id, cue]));
    const cues = beats
      .filter((beat) => beat.sceneId === manifest.id)
      .map((beat) => {
        const cue = cueById.get(beat.cueId);
        if (!cue) throw new TypeError(`Missing cue ${beat.cueId} in ${manifest.id}`);
        return Object.freeze({
          id: cue.id,
          trigger: cue.trigger.type,
          target: cueTarget(cue),
        });
      });

    return Object.freeze({
      index,
      sceneId: manifest.id,
      title: manifest.title,
      renderer: manifest.renderer,
      cues: Object.freeze(cues),
      zoneIds: Object.freeze(manifest.zones.map((zone) => zone.id)),
      modelEventNames: Object.freeze(
        (manifest.modelEvents ?? []).map((event) => event.name),
      ),
      branchContext: manifest.branching?.context ?? null,
      branchActions: Object.freeze(branchActions),
    });
  }));
}

export type MechanicsLaunchMode = "launch" | "reset";

export interface MechanicsMomentRuntime {
  start(sceneId: string): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface MechanicsLaunchRecord {
  readonly runId: number;
  readonly sceneId: string;
  readonly mode: MechanicsLaunchMode;
}

/**
 * Serializes teardown -> neutral-state reset -> production Director start.
 * The controller owns lifecycle only; scene behavior stays in Director.
 */
export class DeterministicMomentLauncher<Runtime extends MechanicsMomentRuntime> {
  private readonly sceneIds: ReadonlySet<string>;
  private readonly createRuntime: () => Runtime;
  private readonly resetState: (
    sceneId: string,
    mode: MechanicsLaunchMode,
  ) => void | Promise<void>;
  private active: Runtime | null = null;
  private activeSceneId: string | null = null;
  private operation: Promise<void> = Promise.resolve();
  private runId = 0;

  constructor(
    sceneIds: readonly string[],
    createRuntime: () => Runtime,
    resetState: (
      sceneId: string,
      mode: MechanicsLaunchMode,
    ) => void | Promise<void>,
  ) {
    this.sceneIds = new Set(sceneIds);
    this.createRuntime = createRuntime;
    this.resetState = resetState;
  }

  launch(
    sceneId: string,
    mode: MechanicsLaunchMode = "launch",
  ): Promise<MechanicsLaunchRecord> {
    if (!this.sceneIds.has(sceneId)) {
      return Promise.reject(new TypeError(`Unknown playable moment: ${sceneId}`));
    }
    const task = this.operation.then(() => this.performLaunch(sceneId, mode));
    this.operation = task.then(() => undefined, () => undefined);
    return task;
  }

  stop(): Promise<void> {
    const task = this.operation.then(async () => {
      const runtime = this.active;
      this.active = null;
      this.activeSceneId = null;
      await runtime?.dispose();
    });
    this.operation = task.then(() => undefined, () => undefined);
    return task;
  }

  currentRuntime(): Runtime | null {
    return this.active;
  }

  currentScene(): string | null {
    return this.activeSceneId;
  }

  private async performLaunch(
    sceneId: string,
    mode: MechanicsLaunchMode,
  ): Promise<MechanicsLaunchRecord> {
    const previous = this.active;
    this.active = null;
    this.activeSceneId = null;
    await previous?.dispose();
    await this.resetState(sceneId, mode);

    const runtime = this.createRuntime();
    const runId = ++this.runId;
    this.active = runtime;
    this.activeSceneId = sceneId;
    try {
      await runtime.start(sceneId);
      return Object.freeze({ runId, sceneId, mode });
    } catch (error) {
      if (this.active === runtime) {
        this.active = null;
        this.activeSceneId = null;
      }
      await runtime.dispose();
      throw error;
    }
  }
}

export interface SimulatedCommandErrorResult {
  readonly evidence: typeof SIMULATED_EVIDENCE_LABEL;
  readonly liveReactorAcceptance: false;
  readonly browserAcceptance: false;
  readonly externalServiceContacted: false;
  readonly sentRequestCount: number;
  readonly mapping: BranchActionMapping;
  readonly requestStatus: Awaited<ReturnType<BranchRuntimeController["request"]>>["status"];
  readonly snapshot: BranchRuntimeSnapshot;
}

function createMemoryStorage(): BranchStateStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

/**
 * Exercises the production correlated command_error contract in memory.
 * This deliberately performs no fetch, model command, or persistent write.
 */
export async function simulateCorrelatedCommandError(
  momentId: BranchMomentId,
  choiceId: BranchChoiceId,
): Promise<SimulatedCommandErrorResult> {
  const mapping = BRANCH_ACTION_MAPPINGS.find((candidate) =>
    candidate.momentId === momentId && candidate.choiceId === choiceId
  );
  if (!mapping) throw new TypeError(`Unknown simulated branch action: ${momentId}/${choiceId}`);

  const manifest = scenes.find((scene) =>
    scene.branching?.actions?.some((action) => action.choiceId === mapping.choiceId)
  );
  const context = manifest?.branching?.context;
  if (!context) throw new TypeError(`No production branch context for ${mapping.choiceId}`);

  let sentRequestCount = 0;
  const runtime = new BranchRuntimeController(createMemoryStorage());
  runtime.enter(context, () => { sentRequestCount += 1; });
  runtime.setReadiness({
    sessionConfirmed: true,
    imageConfirmed: true,
    promptConfirmed: true,
    inputConfirmed: true,
  });
  const requestStatus = (await runtime.request({
    momentId: mapping.momentId,
    choiceId: mapping.choiceId,
    requestId: mapping.requestId,
  })).status;
  const snapshot = runtime.reject({
    type: "command_error",
    requestId: mapping.requestId,
    message: `DEV simulation: correlated command_error for ${mapping.requestId}`,
  });

  return Object.freeze({
    evidence: SIMULATED_EVIDENCE_LABEL,
    liveReactorAcceptance: false,
    browserAcceptance: false,
    externalServiceContacted: false,
    sentRequestCount,
    mapping,
    requestStatus,
    snapshot,
  });
}
