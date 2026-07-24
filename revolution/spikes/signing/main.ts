import declaration from "../../src/scenes/declaration.json";
import type { SceneManifest } from "../../src/engine/types";
import { CueEngine } from "../../src/engine/cues";
import { loadState, resetStoryProgress } from "../../src/engine/state";
import { DeclarationSigningScene } from "../../src/renderers/declaration-signing";

const manifest = declaration as SceneManifest;
const status = document.querySelector("#status")!;
const events = document.querySelector("#events")!;
const log: string[] = [];
const cueEngine = new CueEngine(manifest.cues, {
  play: async (cue) => { status.textContent = cue.subtitle ?? `cue ${cue.id}`; },
  action: (cue) => { log.unshift(cue.id); events.innerHTML = log.slice(0, 8).map((id) => `<li>${id}</li>`).join(""); },
  after: async (cue) => {
    if (cue.then !== "scene:delaware") return;
    scene.dispose();
    document.querySelector("#app")!.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;background:#17120d;color:#f1e6cf;font:24px Georgia,serif"><div>Transitioning to Delaware…<small style="display:block;margin-top:12px;font-size:15px;opacity:.75">Declaration complete · next scene: Delaware</small></div></div>`;
    status.textContent = "Next scene: Delaware";
  },
});

const scene = new DeclarationSigningScene({
  container: document.querySelector("#app")!,
  manifest,
  onStatus: (text) => { status.textContent = text; },
  onEvent: (event) => cueEngine.handleEvent(event),
});
await scene.start();
cueEngine.handleEvent({ type: "scene-start" });

document.querySelector<HTMLButtonElement>("#reset")!.addEventListener("click", () => {
  resetStoryProgress();
  window.location.reload();
});

setInterval(() => cueEngine.update(0.1), 100);
window.addEventListener("beforeunload", () => scene.dispose());
console.info("[signing] state on load", loadState());
