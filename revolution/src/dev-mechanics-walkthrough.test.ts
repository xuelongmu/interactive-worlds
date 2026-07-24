import { describe, expect, it } from "vitest";
import { BRANCH_ACTION_MAPPINGS } from "./branch-state";
import {
  DeterministicMomentLauncher,
  SIMULATED_EVIDENCE_LABEL,
  currentPlayableMoments,
  simulateCorrelatedCommandError,
} from "./dev-mechanics-walkthrough";
import { scenes } from "./scenes";

describe("development mechanics walkthrough", () => {
  it("enumerates every production scene and authored cue in order", () => {
    const moments = currentPlayableMoments();
    expect(moments.map(({ sceneId }) => sceneId)).toEqual(scenes.map(({ id }) => id));
    expect(new Set(moments.map(({ sceneId }) => sceneId))).toHaveLength(scenes.length);
    for (const [index, moment] of moments.entries()) {
      expect(moment.index).toBe(index);
      expect(moment.cues.map(({ id }) => id)).toEqual(scenes[index].cues.map(({ id }) => id));
      expect(moment.zoneIds).toEqual(scenes[index].zones.map(({ id }) => id));
      expect(moment.modelEventNames).toEqual(
        (scenes[index].modelEvents ?? []).map(({ name }) => name),
      );
    }
  });

  it("keeps branch summaries aligned with production mappings", () => {
    const summarized = currentPlayableMoments().flatMap(({ branchActions }) => branchActions);
    expect(summarized.map(({ requestId }) => requestId)).toEqual(
      BRANCH_ACTION_MAPPINGS.map(({ requestId }) => requestId),
    );
    expect(summarized.map(({ binding, label, choiceId }) => ({ binding, label, choiceId }))).toEqual(
      BRANCH_ACTION_MAPPINGS.map(({ binding, label, choiceId }) => ({ binding, label, choiceId })),
    );
  });

  it("serializes dispose, neutral reset, and production start", async () => {
    const events: string[] = [];
    let runtimeId = 0;
    const launcher = new DeterministicMomentLauncher(
      ["teaparty", "lexington"],
      () => {
        const id = ++runtimeId;
        return {
          async start(sceneId: string) { events.push(`start:${id}:${sceneId}`); },
          async dispose() { events.push(`dispose:${id}`); },
        };
      },
      async (sceneId, mode) => { events.push(`neutral:${mode}:${sceneId}`); },
    );

    const first = await launcher.launch("teaparty");
    const second = await launcher.launch("lexington", "reset");
    await launcher.stop();

    expect(first).toEqual({ runId: 1, sceneId: "teaparty", mode: "launch" });
    expect(second).toEqual({ runId: 2, sceneId: "lexington", mode: "reset" });
    expect(events).toEqual([
      "neutral:launch:teaparty",
      "start:1:teaparty",
      "dispose:1",
      "neutral:reset:lexington",
      "start:2:lexington",
      "dispose:2",
    ]);
    expect(launcher.currentRuntime()).toBeNull();
    expect(launcher.currentScene()).toBeNull();
    await expect(launcher.launch("unknown")).rejects.toThrow("Unknown playable moment");
  });

  it("keeps every simulated command_error correlated, retryable, and outside live acceptance", async () => {
    for (const mapping of BRANCH_ACTION_MAPPINGS) {
      const result = await simulateCorrelatedCommandError(mapping.momentId, mapping.choiceId);
      expect(result.evidence).toBe(SIMULATED_EVIDENCE_LABEL);
      expect(result.liveReactorAcceptance).toBe(false);
      expect(result.browserAcceptance).toBe(false);
      expect(result.externalServiceContacted).toBe(false);
      expect(result.sentRequestCount).toBe(1);
      expect(result.requestStatus).toBe("requested");
      expect(result.snapshot.pendingRequestId).toBeNull();
      expect(result.snapshot.presentation.selectedChoiceId).toBeNull();
      expect(result.snapshot.presentation.latchedChoiceId).toBeNull();
      expect(result.snapshot.commandError?.requestId).toBe(mapping.requestId);
      expect(result.snapshot.commandError?.choiceId).toBe(mapping.choiceId);
      expect(result.snapshot.commandError?.visible).toBe(true);
      expect(result.snapshot.commandError?.retryable).toBe(true);
      expect(result.snapshot.lastHandoff?.outcome).toBe("command_error");
    }
  });
});
