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
    status.textContent = "Loading Delaware…";
    const [{ Director }, sound] = await Promise.all([
      import("../../src/engine/director"),
      import("../../src/sound/sound-design"),
    ]);
    const audio = new sound.SoundDesignController(new sound.BrowserSoundPlayback());
    const next = new Director({
      container: document.querySelector("#app")!,
      onExit: () => { status.textContent = "Delaware complete"; },
      ...sound.createSoundDirectorHooks(audio),
    });
    await next.start("delaware");
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
