import "../../src/style.css";
import lexington from "../../src/scenes/lexington.json";
import type { SceneManifest } from "../../src/engine/types";
import { CueEngine } from "../../src/engine/cues";
import { AudioEngine } from "../../src/engine/audio";
import { SplatScene } from "../../src/renderers/splat";

/** SPIKE 2 — Witness register.
 *  Questions this spike answers:
 *    1. Does Spark render a splat at walkable human scale in our shell?
 *    2. Do first-person locomotion + trigger zones + the cue engine work
 *       end-to-end (zone-enter → narration cue → subtitle + ducking)?
 *    3. Is the debug overlay (KeyZ) sufficient to author zones by hand?
 *
 *  Until pipeline:worlds generates the real Lexington world, pass any
 *  Marble .spz via ?splat= (and optionally ?collider=). With no URL a small
 *  public Spark sample loads so locomotion/zones/cues are still reviewable.
 */

const manifest = structuredClone(lexington) as SceneManifest;
const params = new URLSearchParams(location.search);
const FALLBACK_SPLAT = "https://sparkjs.dev/assets/splats/butterfly.spz";

const splatUrl = params.get("splat") ?? undefined;
const colliderUrl = params.get("collider") ?? undefined;
let usingFallback = false;

/** Vite's SPA fallback answers 200 + text/html for missing files, so a bare
 *  ok-check lies; require a non-HTML content-type to count as present. */
async function assetExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    return head.ok && !(head.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

let resolvedSplat = splatUrl ?? manifest.assets.splat;
if (splatUrl && !colliderUrl) {
  // reviewing a custom take: never raycast it against the Lexington collider
  delete manifest.assets.collider;
}
if (!splatUrl && !(await assetExists(manifest.assets.splat!))) {
  resolvedSplat = FALLBACK_SPLAT;
  usingFallback = true;
  delete manifest.assets.collider;
}
if (manifest.assets.collider && !(await assetExists(manifest.assets.collider))) {
  delete manifest.assets.collider;
}

const banner = document.getElementById("banner")!;
banner.innerHTML = usingFallback
  ? `<b>Placeholder splat</b> — the Lexington world hasn't been generated yet.
     Run <code>npm run pipeline:worlds</code> (needs <code>WORLDLABS_API_KEY</code>)
     or open with <code>?splat=&lt;marble-spz-url&gt;</code>.
     Zones and cues are live regardless — walk into them.`
  : `Scene: ${manifest.title}`;

const subtitleEl = document.getElementById("subtitle")!;
const audio = new AudioEngine();
audio.onSubtitle = (text) => { subtitleEl.textContent = text ?? ""; };
// AudioContext needs a gesture; first click unlocks it and starts ambience.
document.addEventListener(
  "click",
  () => {
    audio.ensure();
    if (manifest.audio.ambience) void audio.playAmbience(manifest.audio.ambience);
  },
  { once: true }
);

const hud = document.getElementById("hud")!;
const cueLog: string[] = [];

const cueEngine = new CueEngine(manifest.cues, {
  play: (cue) =>
    audio.playVoice({
      url: `/assets/audio/vo/${cue.id}.mp3`,
      subtitle: cue.subtitle,
      bus: cue.diegetic ? "diegetic" : "narration",
    }),
  action: (cue) => {
    cueLog.unshift(cue.id + (cue.then ? ` → ${cue.then}` : ""));
    if (cue.lockControls) scene.controlsLocked = true;
  },
  // `then:` transitions wait for the line to finish (audio-first contract)
  after: (cue) => {
    if (cue.then === "cutscene:volley") {
      // Spike stand-in for the volley cutscene: hold black 3s, then aftermath cues.
      setTimeout(() => {
        scene.controlsLocked = false;
        cueEngine.handleEvent({ type: "action", name: "cutscene-volley-complete" });
        setTimeout(() => cueEngine.handleEvent({ type: "action", name: "aftermath-walk" }), 9000);
      }, 3000);
    }
  },
});

const scene = new SplatScene({
  container: document.getElementById("app")!,
  manifest,
  splatUrl: resolvedSplat,
  colliderUrl,
  onEvent: (event) => cueEngine.handleEvent(event),
});

scene.onUpdate = (dt) => {
  cueEngine.update(dt);
};

// The sample butterfly is a small object splat, not an environment — hang it
// at eye height a few meters ahead so there's something to look at and orbit.
if (usingFallback) scene.splatMesh?.position.set(0, 1.5, -4);

setInterval(() => {
  const p = scene.position;
  hud.innerHTML = `<b>${manifest.title}</b><br/>
    pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}<br/>
    click to capture mouse · <b>WASD</b> walk · <b>Z</b> zone debug ${scene.debugVisible ? '<span class="ok">(on)</span>' : ""}<br/>
    cues fired:<br/>${cueLog.slice(0, 6).map((c) => `&nbsp;&nbsp;${c}`).join("<br/>") || "&nbsp;&nbsp;—"}`;
}, 250);

cueEngine.handleEvent({ type: "scene-start" });

// dev-only introspection hook
(window as unknown as Record<string, unknown>).__scene = scene;
