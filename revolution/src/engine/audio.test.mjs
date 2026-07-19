import assert from "node:assert/strict";
import test from "node:test";
import { AudioEngine } from "./audio.ts";

test("explicit pause prevents ensure from resuming audio until explicit resume", async () => {
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resumeCalls = 0;
    suspendCalls = 0;
    closeCalls = 0;
    createGain() {
      return {
        connect() {},
        gain: { setTargetAtTime() {}, setValueAtTime() {} },
      };
    }
    async suspend() { this.suspendCalls++; this.state = "suspended"; }
    async resume() { this.resumeCalls++; this.state = "running"; }
    async close() { this.closeCalls++; this.state = "closed"; }
  }

  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const audio = new AudioEngine();
    const context = audio.ensure();
    await audio.pause();
    assert.equal(context.suspendCalls, 1);
    assert.equal(context.state, "suspended");

    audio.ensure();
    assert.equal(context.resumeCalls, 0, "ensure must not defeat an explicit pause");

    await audio.resume();
    assert.equal(context.resumeCalls, 1);
    assert.equal(context.state, "running");

    await audio.dispose();
    assert.equal(context.closeCalls, 1);
    assert.equal(context.state, "closed");
    assert.throws(() => audio.ensure(), /disposed/);
  } finally {
    globalThis.AudioContext = previous;
  }
});
