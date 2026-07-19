import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { AudioEngine } from "./engine/audio.ts";
import {
  loadState,
  markSceneComplete,
  saveSignature,
} from "./engine/state.ts";
import { getResumeScene } from "./shell.ts";

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function sceneIds() {
  const sceneDir = new URL("./scenes/", import.meta.url);
  return readdirSync(sceneDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(new URL(name, sceneDir), "utf8")))
    .map(({ id }) => ({ id }));
}

test("every authored chapter can be restored as the in-progress resume target", () => {
  const scenes = sceneIds();
  assert.ok(scenes.length > 0);
  for (const scene of scenes) {
    const state = { completedScenes: [], currentSceneId: scene.id, signature: null };
    assert.equal(getResumeScene(scenes, state)?.id, scene.id);
  }
});

test("signature vectors survive later chapter completion for the Treaty payoff", () => {
  installStorage();
  const signature = [{ points: [[0.2, 0.3], [0.4, 0.5]] }];
  saveSignature(signature);
  for (const { id } of sceneIds()) markSceneComplete(id);
  assert.deepEqual(loadState().signature, signature);
});

test("missing narration preserves subtitle timing and restores ambience", async () => {
  const calls = [];
  const ambienceGain = [];
  const engine = new AudioEngine();
  engine.ctx = { currentTime: 0, state: "running" };
  engine.buses = new Map([
    ["narration", { gain: { setTargetAtTime() {} } }],
    ["ambience", { gain: { setTargetAtTime: (...args) => ambienceGain.push(args) } }],
    ["music", { gain: { setTargetAtTime() {} } }],
  ]);
  engine.load = async () => null;
  engine.waitWhileUnpaused = async (...args) => calls.push(["wait", ...args]);
  engine.onSubtitle = (subtitle) => calls.push(["subtitle", subtitle]);

  await engine.playVoice({ url: "/missing.mp3", subtitle: "Still readable." });

  assert.deepEqual(calls, [
    ["subtitle", "Still readable."],
    ["wait", 2_000, 0],
    ["subtitle", null],
  ]);
  assert.deepEqual(ambienceGain.at(-1), [1, 0, 0.15]);
});
