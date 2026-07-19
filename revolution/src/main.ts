import "./style.css";
import { scenes } from "./scenes";
import { loadState } from "./engine/state";
import { Director } from "./engine/director";

/** Shell: Play resumes at the first unfinished chapter; the chapter list
 *  doubles as a dev chapter-select. The director owns the DOM once a
 *  chapter starts and hands back here at story end. */

const app = document.getElementById("app")!;
let director: Director | null = null;

function play(sceneId: string) {
  void director?.dispose();
  director = new Director({ container: app, onExit: renderMenu });
  void director.start(sceneId);
}

function renderMenu() {
  director = null;
  const state = loadState();
  const firstUnfinished =
    scenes.find((s) => !state.completedScenes.includes(s.id)) ?? scenes[0];

  app.innerHTML = `
    <main style="max-width:680px;margin:8vh auto;padding:0 24px">
      <p style="color:var(--dim);letter-spacing:0.2em;text-transform:uppercase;font-size:12px">An interactive story</p>
      <h1 style="font-size:42px;font-weight:normal;margin:8px 0 4px">The Revolution</h1>
      <p style="color:var(--dim);margin-bottom:28px">1773 – 1783 · splats, world models, and ink</p>

      <button id="play" style="font-size:17px;padding:12px 36px">
        ${state.completedScenes.length ? "Continue" : "Play"} — ${firstUnfinished.title}
      </button>

      <h2 style="font-size:14px;color:var(--dim);text-transform:uppercase;letter-spacing:0.15em;margin-top:40px">Chapters (dev select)</h2>
      <ul style="list-style:none;padding:0;margin:12px 0">
        ${scenes
          .map(
            (s, i) => `
          <li style="margin:10px 0">
            <a href="#" data-scene="${s.id}" style="color:var(--ink);text-decoration:none">${i + 1}. ${s.title}</a>
            <span style="color:var(--dim)"> — <code>${s.renderer}</code>${
              state.completedScenes.includes(s.id) ? ' · <span style="color:#7fae6a">completed</span>' : ""
            }</span>
          </li>`
          )
          .join("")}
      </ul>

      <h2 style="font-size:14px;color:var(--dim);text-transform:uppercase;letter-spacing:0.15em;margin-top:36px">Spikes (review builds)</h2>
      <ul style="list-style:none;padding:0;margin:12px 0 36px">
        <li style="margin:10px 0"><a href="/spikes/worldmodel/">Spike 1 — World model (Delaware boat, live Lingbot World 2 session)</a></li>
        <li style="margin:10px 0"><a href="/spikes/splat/">Spike 2 — Walkable splat (Lexington cue zones, Spark renderer)</a></li>
        <li style="margin:10px 0"><a href="/spikes/sandtable/">Spike 3 — Saratoga sand table (Actor register)</a></li>
      </ul>
      <p style="color:var(--dim);font-size:13px">
        Missing worlds/audio degrade gracefully — generate assets with
        <code>npm run pipeline:worlds</code> / <code>pipeline:vo</code> /
        <code>pipeline:models</code>.
      </p>
    </main>
  `;

  document.getElementById("play")!.addEventListener("click", () => play(firstUnfinished.id));
  for (const link of app.querySelectorAll<HTMLAnchorElement>("[data-scene]")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      play(link.dataset.scene!);
    });
  }
}

renderMenu();
