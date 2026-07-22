import "../../src/style.css";
import {
  BRANCH_ACTION_MAPPINGS,
  loadBranchState,
  resetBranchState,
  type BranchChoiceId,
  type BranchMomentId,
} from "../../src/branch-state";
import {
  DeterministicMomentLauncher,
  SIMULATED_EVIDENCE_LABEL,
  currentPlayableMoments,
  simulateCorrelatedCommandError,
  type MechanicsLaunchMode,
} from "../../src/dev-mechanics-walkthrough";
import { Director } from "../../src/engine/director";
import { loadState, resetStoryProgress } from "../../src/engine/state";
import type {
  BeatNavigationSnapshot,
  ControlHandoffDetail,
  ContextualChoiceSnapshot,
  EngineEvent,
  RuntimePauseDetail,
} from "../../src/engine/types";
import type { TimingHandoffSample } from "../../src/timing/telemetry";

type ObservationChannel = "state" | "branch" | "input" | "cue";
type ObservationSource = "LOCAL DEV RUNTIME" | typeof SIMULATED_EVIDENCE_LABEL;

const moments = currentPlayableMoments();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  })[character]!);
}

function momentMarkup(): string {
  return moments.map((moment) => `
    <article class="moment-card" data-moment="${escapeHtml(moment.sceneId)}">
      <div class="moment-heading">
        <span class="moment-index">${String(moment.index + 1).padStart(2, "0")}</span>
        <div>
          <h3>${escapeHtml(moment.title)}</h3>
          <p><code>${escapeHtml(moment.sceneId)}</code> · ${escapeHtml(moment.renderer)}</p>
        </div>
      </div>
      <dl class="moment-facts">
        <div><dt>Cues</dt><dd>${moment.cues.length}</dd></div>
        <div><dt>Zones</dt><dd>${moment.zoneIds.length}</dd></div>
        <div><dt>Model events</dt><dd>${moment.modelEventNames.length}</dd></div>
      </dl>
      <details>
        <summary>Authored cue sequence</summary>
        <ol class="cue-sequence">
          ${moment.cues.map((cue) => `
            <li><code>${escapeHtml(cue.id)}</code><span>${escapeHtml(cue.trigger)}${cue.target ? ` · ${escapeHtml(cue.target)}` : ""}</span></li>
          `).join("")}
        </ol>
      </details>
      <div class="branch-summary">
        <span>Branch</span>
        <code>${escapeHtml(moment.branchContext ?? "none")}</code>
        ${moment.branchActions.length > 0 ? `
          <ul>${moment.branchActions.map((action) => `
            <li><kbd>${action.binding}</kbd> ${escapeHtml(action.label)}</li>
          `).join("")}</ul>
        ` : ""}
      </div>
      <div class="moment-actions">
        <button type="button" data-run-mode="launch" data-scene-id="${escapeHtml(moment.sceneId)}">Launch neutral</button>
        <button type="button" class="secondary" data-run-mode="reset" data-scene-id="${escapeHtml(moment.sceneId)}">Reset &amp; relaunch</button>
      </div>
    </article>
  `).join("");
}

function simulationOptions(): string {
  return BRANCH_ACTION_MAPPINGS.map((mapping) => `
    <option value="${escapeHtml(mapping.choiceId)}">${mapping.binding} · ${escapeHtml(mapping.label)} · ${escapeHtml(mapping.momentId)}</option>
  `).join("");
}

export function mountMechanicsWalkthrough(app: HTMLElement): void {
  app.innerHTML = `
    <main class="mechanics-walkthrough">
      <header class="walkthrough-header">
        <div>
          <p class="eyebrow">DEV-ONLY · production contracts under observation</p>
          <h1>Mechanics walkthrough</h1>
          <p class="lede">Launch any current moment from a neutral local state. Runtime observations are instrumentation, not external-service or browser acceptance.</p>
        </div>
        <div class="warning-badge">NO LIVE ACCEPTANCE CLAIM</div>
      </header>

      <section class="walkthrough-controls" aria-label="Active walkthrough controls">
        <p id="run-status">No moment is running.</p>
        <div>
          <button type="button" id="previous-beat" disabled>Previous authored beat</button>
          <button type="button" id="next-beat" disabled>Next authored beat</button>
          <button type="button" id="stop-run" class="secondary" disabled>Stop</button>
        </div>
      </section>

      <section class="stage-section" aria-labelledby="stage-heading">
        <div class="section-heading">
          <div><p class="eyebrow">Production Director</p><h2 id="stage-heading">Active moment</h2></div>
          <p>Nothing launches until a moment button is pressed.</p>
        </div>
        <div id="mechanics-stage" class="mechanics-stage-host">
          <p class="stage-empty">Choose a moment below to create a fresh Director run.</p>
        </div>
      </section>

      <section class="moments-section" aria-labelledby="moments-heading">
        <div class="section-heading">
          <div><p class="eyebrow">Manifest inventory</p><h2 id="moments-heading">${moments.length} current playable moments</h2></div>
          <p>Order, cues, renderer, zones, model events, and branch mappings come directly from production manifests.</p>
        </div>
        <div class="moment-grid">${momentMarkup()}</div>
      </section>

      <section class="observations-section" aria-labelledby="observations-heading">
        <div class="section-heading">
          <div><p class="eyebrow">Adapter callbacks</p><h2 id="observations-heading">Observations</h2></div>
          <p>Each lane records a public engine handoff without changing game behavior.</p>
        </div>
        <div class="observation-grid">
          ${(["state", "branch", "input", "cue"] as ObservationChannel[]).map((channel) => `
            <article class="observation-panel">
              <h3>${channel}</h3>
              <ol data-observation-log="${channel}"><li class="empty-observation">No observations yet.</li></ol>
            </article>
          `).join("")}
        </div>
        <details class="state-snapshot" open>
          <summary>Current local state snapshot</summary>
          <pre id="state-snapshot">No moment launched.</pre>
        </details>
      </section>

      <section class="simulation-section" aria-labelledby="simulation-heading">
        <div class="simulation-label">DEV / SIMULATED</div>
        <h2 id="simulation-heading">Correlated command_error contract</h2>
        <p>This in-memory exercise uses <code>BranchRuntimeController</code>. It performs no fetch or model command and is never evidence of live Reactor or browser acceptance.</p>
        <div class="simulation-controls">
          <label>Production action mapping<select id="simulation-action">${simulationOptions()}</select></label>
          <button type="button" id="simulate-error">Run DEV / SIMULATED error</button>
        </div>
        <pre id="simulation-output">Simulation has not run.</pre>
      </section>
    </main>`;

  const stageHost = app.querySelector<HTMLElement>("#mechanics-stage")!;
  const runStatus = app.querySelector<HTMLElement>("#run-status")!;
  const stateSnapshot = app.querySelector<HTMLElement>("#state-snapshot")!;
  const previousBeat = app.querySelector<HTMLButtonElement>("#previous-beat")!;
  const nextBeat = app.querySelector<HTMLButtonElement>("#next-beat")!;
  const stopRun = app.querySelector<HTMLButtonElement>("#stop-run")!;
  let observationSequence = 0;
  let latestBeat: BeatNavigationSnapshot | null = null;

  const record = (
    channel: ObservationChannel,
    label: string,
    payload: unknown,
    source: ObservationSource = "LOCAL DEV RUNTIME",
  ) => {
    const list = app.querySelector<HTMLOListElement>(`[data-observation-log="${channel}"]`)!;
    list.querySelector(".empty-observation")?.remove();
    const item = document.createElement("li");
    const heading = document.createElement("div");
    heading.className = "observation-heading";
    heading.textContent = `${String(++observationSequence).padStart(3, "0")} · ${source} · ${label}`;
    const details = document.createElement("pre");
    details.textContent = JSON.stringify(payload, null, 2);
    item.append(heading, details);
    list.prepend(item);
    while (list.children.length > 16) list.lastElementChild?.remove();
  };

  const clearObservations = () => {
    observationSequence = 0;
    for (const list of app.querySelectorAll<HTMLOListElement>("[data-observation-log]")) {
      list.innerHTML = '<li class="empty-observation">No observations yet.</li>';
    }
  };

  const publishState = (label: string) => {
    const snapshot = {
      activeSceneId: launcher.currentScene(),
      story: loadState(),
      branches: loadBranchState(window.localStorage),
    };
    stateSnapshot.textContent = JSON.stringify(snapshot, null, 2);
    record("state", label, snapshot);
  };

  const syncBeatControls = () => {
    const runtimeAvailable = launcher.currentRuntime() !== null;
    previousBeat.disabled = !runtimeAvailable || latestBeat?.active !== true || !latestBeat.previousAvailable;
    nextBeat.disabled = !runtimeAvailable || latestBeat?.active !== true || !latestBeat.nextAvailable;
    stopRun.disabled = !runtimeAvailable;
  };

  const launcher = new DeterministicMomentLauncher(
    moments.map(({ sceneId }) => sceneId),
    () => new Director({
      container: stageHost,
      reviewMode: false,
      onExit: (target) => {
        record("state", "Director exit", { target: target ?? "title" });
        void launcher.stop().then(() => {
          stageHost.innerHTML = '<p class="stage-empty">Director exited. Choose another moment.</p>';
          latestBeat = null;
          runStatus.textContent = "No moment is running.";
          syncBeatControls();
          publishState("Director disposed after exit");
        });
      },
      onEngineEvent: (event: EngineEvent, sceneId: string) => {
        record("cue", "Normalized engine event", { sceneId, event });
      },
      onControlHandoff: (detail: ControlHandoffDetail) => {
        record("input", "Control handoff", detail);
      },
      onContextualChoiceSnapshot: (snapshot: ContextualChoiceSnapshot) => {
        record("branch", "Contextual choice snapshot", snapshot);
        publishState("Branch snapshot published");
      },
      onBeatNavigationSnapshot: (snapshot: BeatNavigationSnapshot) => {
        latestBeat = snapshot;
        record("cue", "Beat navigation snapshot", snapshot);
        syncBeatControls();
      },
      onBeatNavigationResult: (result) => {
        record("cue", "Beat navigation result", result);
      },
      onPauseState: (detail: RuntimePauseDetail) => {
        record("state", "Pause state", detail);
      },
      onTimingSample: (sample: TimingHandoffSample) => {
        record("cue", "Timing sample", sample);
      },
    }),
    (sceneId: string, mode: MechanicsLaunchMode) => {
      resetStoryProgress();
      resetBranchState(window.localStorage);
      clearObservations();
      latestBeat = null;
      record("state", "Neutral deterministic baseline", { sceneId, mode });
      stateSnapshot.textContent = JSON.stringify({
        activeSceneId: sceneId,
        story: loadState(),
        branches: loadBranchState(window.localStorage),
      }, null, 2);
    },
  );

  const setRunButtonsDisabled = (disabled: boolean) => {
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-run-mode]")) {
      button.disabled = disabled;
    }
  };

  const runMoment = async (sceneId: string, mode: MechanicsLaunchMode) => {
    setRunButtonsDisabled(true);
    runStatus.textContent = `${mode === "reset" ? "Resetting" : "Launching"} ${sceneId}…`;
    try {
      const result = await launcher.launch(sceneId, mode);
      runStatus.textContent = `Run ${result.runId}: ${sceneId} · neutral ${mode}`;
      publishState("Moment ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runStatus.textContent = `Launch failed: ${message}`;
      record("state", "Moment launch failed", { sceneId, mode, message });
    } finally {
      setRunButtonsDisabled(false);
      syncBeatControls();
    }
  };

  app.querySelector(".moment-grid")!.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-run-mode]");
    if (!button) return;
    void runMoment(
      button.dataset.sceneId!,
      button.dataset.runMode as MechanicsLaunchMode,
    );
  });

  const navigateBeat = async (direction: "previous" | "next") => {
    const runtime = launcher.currentRuntime();
    const snapshot = latestBeat;
    if (!runtime || !snapshot) return;
    const request = {
      type: direction === "next" ? "nextBeat" as const : "previousBeat" as const,
      sceneId: snapshot.sceneId,
      transitionKey: snapshot.transitionKey,
    };
    if (direction === "next") await runtime.nextBeat(request);
    else await runtime.previousBeat(request);
  };

  previousBeat.addEventListener("click", () => { void navigateBeat("previous"); });
  nextBeat.addEventListener("click", () => { void navigateBeat("next"); });
  stopRun.addEventListener("click", () => {
    void launcher.stop().then(() => {
      stageHost.innerHTML = '<p class="stage-empty">Run stopped. Choose a moment to begin again.</p>';
      latestBeat = null;
      runStatus.textContent = "No moment is running.";
      syncBeatControls();
      publishState("Run stopped");
    });
  });

  const simulationSelect = app.querySelector<HTMLSelectElement>("#simulation-action")!;
  const simulationOutput = app.querySelector<HTMLElement>("#simulation-output")!;
  app.querySelector<HTMLButtonElement>("#simulate-error")!.addEventListener("click", () => {
    const mapping = BRANCH_ACTION_MAPPINGS.find(({ choiceId }) => choiceId === simulationSelect.value);
    if (!mapping) return;
    void simulateCorrelatedCommandError(
      mapping.momentId as BranchMomentId,
      mapping.choiceId as BranchChoiceId,
    ).then((result) => {
      simulationOutput.textContent = JSON.stringify(result, null, 2);
      record("branch", "Correlated command_error", result, SIMULATED_EVIDENCE_LABEL);
    });
  });

  syncBeatControls();
}
