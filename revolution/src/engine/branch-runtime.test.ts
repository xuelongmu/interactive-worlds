// @ts-nocheck -- assertions intentionally exercise the public runtime as JS consumers do.
import assert from "node:assert/strict";
import { it as test } from "vitest";

import {
  BRANCH_ACTION_MAPPINGS,
  BRANCH_STATE_STORAGE_KEY,
} from "../branch-state.ts";
import { BranchRuntimeController } from "./branch-runtime.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const contexts = {
  "tea-party-deck-duty": "tea-party-deck-duty-choice",
  "delaware-duty": "delaware-duty-choice",
  "trenton-perspective": "trenton-perspective-choice",
  "saratoga-analysis-lens": "saratoga-analysis-lens-choice",
};

const READY = {
  sessionConfirmed: true,
  imageConfirmed: true,
  promptConfirmed: true,
  inputConfirmed: true,
};

function requestFor(mapping) {
  return {
    momentId: mapping.momentId,
    choiceId: mapping.choiceId,
    requestId: mapping.requestId,
  };
}

test("all four readiness confirmations gate both exact E/F actions", () => {
  for (const [momentId, context] of Object.entries(contexts)) {
    const runtime = new BranchRuntimeController(new MemoryStorage());
    runtime.enter(context, async () => {});
    const actions = runtime.snapshot().presentation.actions;
    assert.deepEqual(actions.map((action) => action.binding), ["E", "F"]);
    for (const missing of Object.keys(READY)) {
      runtime.setReadiness({ ...READY, [missing]: false });
      assert.equal(runtime.snapshot().ready, false, `${momentId}:${missing}`);
      assert.ok(runtime.snapshot().presentation.actions.every((action) => !action.usable));
    }
    runtime.setReadiness(READY);
    assert.equal(runtime.snapshot().ready, true);
    assert.ok(runtime.snapshot().presentation.actions.every((action) => action.usable));
  }
});

test("every E/F request is edge-only and only its normalized confirmation latches", async () => {
  for (const mapping of BRANCH_ACTION_MAPPINGS) {
    const storage = new MemoryStorage();
    const sent = [];
    const runtime = new BranchRuntimeController(storage);
    runtime.enter(contexts[mapping.momentId], (request) => { sent.push(request); });
    runtime.setReadiness(READY);

    const request = requestFor(mapping);
    assert.deepEqual(await runtime.request(request), { status: "requested", requestId: mapping.requestId });
    assert.deepEqual(sent, [request]);
    assert.equal(runtime.snapshot().presentation.latchedChoiceId, null);
    assert.equal(storage.getItem(BRANCH_STATE_STORAGE_KEY), null);

    runtime.confirm({
      type: "branch-confirmed",
      id: mapping.confirmationEventId,
      requestId: mapping.requestId,
    });
    assert.equal(runtime.snapshot().presentation.latchedChoiceId, mapping.choiceId);
    assert.equal(runtime.snapshot().presentation.selectedChoiceId, mapping.choiceId);
    assert.match(storage.getItem(BRANCH_STATE_STORAGE_KEY), new RegExp(mapping.choice));
  }
});

test("command_error clears pending, remains visible and retryable, then confirmation succeeds", async () => {
  const mapping = BRANCH_ACTION_MAPPINGS[3];
  const runtime = new BranchRuntimeController(new MemoryStorage());
  runtime.enter(contexts[mapping.momentId], async () => {});
  runtime.setReadiness(READY);
  const request = requestFor(mapping);

  await runtime.request(request);
  runtime.reject({ type: "command_error", requestId: mapping.requestId, message: "backend refused it" });
  assert.equal(runtime.snapshot().pendingRequestId, null);
  assert.deepEqual(runtime.snapshot().commandError, {
    momentId: mapping.momentId,
    choiceId: mapping.choiceId,
    requestId: mapping.requestId,
    message: "backend refused it",
    visible: true,
    retryable: true,
  });
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, null);

  assert.equal((await runtime.request(request)).status, "requested");
  runtime.confirm({ type: "branch-confirmed", id: mapping.confirmationEventId, requestId: mapping.requestId });
  assert.equal(runtime.snapshot().commandError, null);
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, mapping.choiceId);
});

test("duplicate/repeat and mismatched confirmations never fabricate selection", async () => {
  const e = BRANCH_ACTION_MAPPINGS[4];
  const f = BRANCH_ACTION_MAPPINGS[5];
  const runtime = new BranchRuntimeController(new MemoryStorage());
  runtime.enter(contexts[e.momentId], async () => {});
  runtime.setReadiness(READY);

  await runtime.request(requestFor(e));
  assert.equal((await runtime.request(requestFor(e))).status, "duplicate");
  runtime.confirm({ type: "branch-confirmed", id: f.confirmationEventId, requestId: f.requestId });
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, null);
  runtime.confirm({ type: "branch-confirmed", id: e.confirmationEventId, requestId: e.requestId });
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, e.choiceId);
  assert.equal((await runtime.request(requestFor(f))).status, "already-latched");
  runtime.confirm({ type: "branch-confirmed", id: e.confirmationEventId, requestId: e.requestId });
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, e.choiceId);
});

test("scene entry discards pending state, replay gets a fresh latch, and full restart alone clears durable choices", async () => {
  const e = BRANCH_ACTION_MAPPINGS[6];
  const f = BRANCH_ACTION_MAPPINGS[7];
  const storage = new MemoryStorage();
  const runtime = new BranchRuntimeController(storage);
  runtime.enter(contexts[e.momentId], async () => {});
  runtime.setReadiness(READY);
  await runtime.request(requestFor(e));
  runtime.confirm({ type: "branch-confirmed", id: e.confirmationEventId, requestId: e.requestId });

  runtime.enter("valley-forge-analysis-acknowledgement");
  assert.match(runtime.snapshot().presentation.acknowledgement, /river road/);
  runtime.enter(contexts[e.momentId], async () => {});
  runtime.setReadiness(READY);
  assert.equal(runtime.snapshot().presentation.selectedChoiceId, e.choiceId);
  assert.equal(runtime.snapshot().presentation.latchedChoiceId, null);
  await runtime.request(requestFor(f));
  runtime.clearTransient();
  runtime.confirm({ type: "branch-confirmed", id: f.confirmationEventId, requestId: f.requestId });
  assert.equal(runtime.snapshot().presentation.selectedChoiceId, e.choiceId);

  runtime.restartStory();
  assert.equal(storage.getItem(BRANCH_STATE_STORAGE_KEY), null);
  assert.equal(runtime.snapshot().presentation.selectedChoiceId, null);
});
