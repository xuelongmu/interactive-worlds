import "../../src/style.css";
import delaware from "../../src/scenes/delaware.json";
import type { SceneManifest } from "../../src/engine/types";
import { CueEngine } from "../../src/engine/cues";
import { AudioEngine } from "../../src/engine/audio";
import { WorldModelSession, bindWorldModelKeys } from "../../src/renderers/worldmodel";

/** SPIKE 1 — Participant register.
 *  Questions this spike answers:
 *    1. Can we hold a controllable Lingbot World 2 session from the browser
 *       through the token broker (key never client-side)?
 *    2. What is real latency: connect handshake, first frame, command->chunk?
 *    3. Do prompt hot-swaps work as the scripted-beat mechanism (storm, landing)?
 *    4. Does the cue engine drive subtitles off model-events end-to-end?
 */

const manifest = delaware as SceneManifest;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 360px;height:100vh">
    <div style="position:relative;background:#000;display:flex;align-items:center;justify-content:center">
      <video id="video" autoplay playsinline muted style="max-width:100%;max-height:100%"></video>
      <div id="subtitle" class="subtitle-bar"></div>
      <div class="hud" id="metrics"><b>metrics</b><br/>waiting for session…</div>
    </div>
    <aside style="background:var(--panel);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
      <h1 style="font-size:18px;font-weight:normal">Spike 1 — Delaware crossing</h1>
      <div id="status" style="font:12px Consolas,monospace;color:var(--dim)">disconnected</div>
      <button id="connect">Connect &amp; start generation</button>
      <button id="disconnect" class="secondary" disabled>Disconnect (ends the session)</button>
      <label style="font-size:12px;color:var(--dim)">Reference image (conditioning frame)
        <input type="file" id="image" accept="image/*" style="margin-top:4px;width:100%"/>
      </label>
      <label style="font-size:12px;color:var(--dim)">Prompt
        <textarea id="prompt" rows="7"></textarea>
      </label>
      <div>
        <div style="font-size:12px;color:var(--dim);margin-bottom:6px">Scripted beats (prompt hot-swap → model-event → cue)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary" data-event="knox">Knox</button>
          <button class="secondary" data-event="storm">Storm</button>
          <button class="secondary" data-event="landing">Landing</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--dim)">Controls: <b>W/S</b> forward/back · <b>A/D</b> strafe · <b>arrows</b> look</div>
      <div style="flex:1;min-height:120px">
        <div style="font-size:12px;color:var(--dim);margin-bottom:6px">Event log</div>
        <pre id="log" style="font:11px/1.5 Consolas,monospace;color:var(--dim);white-space:pre-wrap;margin:0"></pre>
      </div>
    </aside>
  </div>
`;

const video = document.getElementById("video") as HTMLVideoElement;
const statusEl = document.getElementById("status")!;
const metricsEl = document.getElementById("metrics")!;
const logEl = document.getElementById("log")!;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const imageEl = document.getElementById("image") as HTMLInputElement;
const subtitleEl = document.getElementById("subtitle")!;
promptEl.value = manifest.assets.prompt ?? "";

const log = (line: string) => {
  logEl.textContent = `${new Date().toISOString().slice(11, 19)} ${line}\n${logEl.textContent}`.slice(0, 8000);
};

const audio = new AudioEngine();
audio.onSubtitle = (text) => { subtitleEl.textContent = text ?? ""; };

// Fresh engine per session — reconnecting must replay the opening cues.
const makeCueEngine = () =>
  new CueEngine(manifest.cues, {
    play: (cue) =>
      audio.playVoice({
        url: `/assets/audio/vo/${cue.id}.mp3`,
        subtitle: cue.subtitle,
        bus: cue.diegetic ? "diegetic" : "narration",
      }),
    action: (cue) => log(`cue ${cue.id}${cue.then ? ` → ${cue.then}` : ""}`),
  });
let cueEngine = makeCueEngine();
setInterval(() => cueEngine.update(0.25), 250);

// ---- metrics ----------------------------------------------------------
let framesSeen = 0;
let fps = 0;
let lastFpsAt = performance.now();
let chunkCount = 0;
let lastCmdToChunkMs: number | null = null;
let firstFrameAt: number | null = null;
let connectStartedAt = 0;

// Single frame pump per session — a stale pump from a previous connect
// would double-count frames and inflate the fps readout.
let pumpGeneration = 0;
function startFramePump() {
  const generation = ++pumpGeneration;
  const onVideoFrame = () => {
    if (generation !== pumpGeneration) return;
    framesSeen++;
    if (firstFrameAt === null) {
      firstFrameAt = performance.now();
      log(`first frame ${(firstFrameAt - connectStartedAt).toFixed(0)}ms after connect click`);
    }
    const now = performance.now();
    if (now - lastFpsAt >= 1000) {
      fps = framesSeen; framesSeen = 0; lastFpsAt = now;
    }
    video.requestVideoFrameCallback(onVideoFrame);
  };
  video.requestVideoFrameCallback(onVideoFrame);
}
const stopFramePump = () => { pumpGeneration++; };

function resetMetrics() {
  framesSeen = 0; fps = 0; lastFpsAt = performance.now();
  chunkCount = 0; lastCmdToChunkMs = null; firstFrameAt = null;
}

let session: WorldModelSession | null = null;
let unbindKeys: (() => void) | null = null;

function renderMetrics() {
  const timings = session?.getConnectionTimings();
  metricsEl.innerHTML = `<b>metrics</b><br/>
    video: ${video.videoWidth}×${video.videoHeight} @ <b>${fps}</b> fps<br/>
    chunks: ${chunkCount}<br/>
    cmd→chunk: ${lastCmdToChunkMs === null ? "—" : `<b>${lastCmdToChunkMs.toFixed(0)}ms</b>`}<br/>
    connect: ${timings ? `${timings.totalMs.toFixed(0)}ms (session ${timings.sessionCreationMs.toFixed(0)} / transport ${timings.transportConnectingMs.toFixed(0)})` : "—"}<br/>
    first frame: ${firstFrameAt ? `${(firstFrameAt - connectStartedAt).toFixed(0)}ms` : "—"}`;
}
setInterval(renderMetrics, 500);

// ---- scripted beats ---------------------------------------------------
// Fired by the manifest timeline in a normal run; the panel buttons are
// manual overrides for review. Either path fires each beat at most once.
const firedBeats = new Set<string>();
let beatTimers: number[] = [];
/** invalidates in-flight beat continuations across teardown/reconnect */
let sessionGeneration = 0;

async function fireBeat(name: string) {
  if (!session || firedBeats.has(name)) return;
  firedBeats.add(name);
  const generation = sessionGeneration;
  const beat = manifest.modelEvents?.find((e) => e.name === name);
  if (beat?.prompt) {
    await session.steer(name, beat.prompt);
    // a disconnect (or reconnect) while steer was in flight owns the cue
    // engine now — a stale continuation must not fire into the new session
    if (generation !== sessionGeneration) return;
    log(`steer → ${name} (prompt hot-swap)`);
  } else {
    cueEngine.handleEvent({ type: "model-event", name });
    log(`model-event → ${name} (cue only)`);
  }
  if (name === "landing") {
    // the crossing's final beat: column forms on the shore -> DEL-041
    beatTimers.push(window.setTimeout(
      () => cueEngine.handleEvent({ type: "action", name: "column-formed" }), 12_000
    ));
  }
}

function startBeatTimeline() {
  for (const beat of manifest.modelEvents ?? []) {
    beatTimers.push(window.setTimeout(() => void fireBeat(beat.name), beat.at * 1000));
  }
}
function clearBeatTimeline() {
  for (const timer of beatTimers) clearTimeout(timer);
  beatTimers = [];
  firedBeats.clear();
}

// ---- session ----------------------------------------------------------
async function getReferenceImage(): Promise<Blob> {
  const file = imageEl.files?.[0];
  if (file) return file;
  const res = await fetch(manifest.assets.referenceImage!);
  // vite's SPA fallback answers 200 + text/html for missing files
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error(
      `No reference image chosen and ${manifest.assets.referenceImage} is missing — run pipeline:frames or pick a file`
    );
  }
  return res.blob();
}

/** Tear down everything a connect may have set up — including a partially
 *  connected session after a failed connect, which would otherwise keep a
 *  GPU session alive and billing with the Disconnect button disabled. */
async function teardown() {
  sessionGeneration++;
  clearBeatTimeline();
  stopFramePump();
  unbindKeys?.();
  unbindKeys = null;
  audio.stopAmbience();
  const dying = session;
  session = null;
  await dying?.disconnect();
}

const connectBtn = document.getElementById("connect") as HTMLButtonElement;
connectBtn.addEventListener("click", async () => {
  connectBtn.disabled = true;
  audio.ensure();
  resetMetrics();
  cueEngine = makeCueEngine();
  connectStartedAt = performance.now();
  try {
    const referenceImage = await getReferenceImage();
    session = new WorldModelSession({
      video,
      referenceImage,
      prompt: promptEl.value,
      onEvent: (event) => {
        log(`event ${event.type}${"name" in event ? `:${event.name}` : ""}`);
        cueEngine.handleEvent(event);
      },
      onMessage: (message) => {
        if (message.type === "chunk_complete") {
          chunkCount = message.chunk_index + 1;
          if (session && session.lastCommandAt > 0) {
            lastCmdToChunkMs = performance.now() - session.lastCommandAt;
            session.lastCommandAt = 0;
          }
        } else if (message.type === "generation_started") {
          log(`generation started (${message.chunk_num} chunks / ${message.frame_num} frames per run)`);
          cueEngine.handleEvent({ type: "scene-start" });
          cueEngine.handleEvent({ type: "action", name: "boarded" });
          cueEngine.handleEvent({ type: "action", name: "control-granted" });
          // beats fire from the manifest timeline (guarded: runs auto-restart)
          if (beatTimers.length === 0) startBeatTimeline();
        } else if (message.type === "command_error") {
          log(`✗ ${message.command}: ${message.reason}`);
        } else if (message.type !== "state") {
          log(message.type);
        }
      },
      onStatus: (status) => { statusEl.textContent = status; log(`status: ${status}`); },
    });
    await session.connect();
    startFramePump();
    unbindKeys = bindWorldModelKeys(session);
    if (manifest.audio.ambience) void audio.playAmbience(manifest.audio.ambience);
    statusEl.textContent = "ready — drive with WASD/arrows";
    disconnectBtn.disabled = false;
  } catch (error) {
    log(`✗ ${error}`);
    await teardown();
    statusEl.textContent = `error: ${error}`;
    connectBtn.disabled = false;
  }
});

const disconnectBtn = document.getElementById("disconnect") as HTMLButtonElement;
disconnectBtn.addEventListener("click", async () => {
  disconnectBtn.disabled = true;
  await teardown();
  statusEl.textContent = "disconnected";
  connectBtn.disabled = false;
  log("session ended");
});
// GPU sessions bill by the minute — never leave one running past the page.
window.addEventListener("beforeunload", () => void teardown());

// manual beat overrides for review (same at-most-once path as the timeline)
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-event]")) {
  button.addEventListener("click", () => void fireBeat(button.dataset.event!));
}
