import "./style.css";
import { scenes } from "./scenes";
import { loadState, resetStoryProgress } from "./engine/state";
import { Director, type DirectorExitTarget } from "./engine/director";
import { installSessionChallenge } from "./security/session-challenge";
import {
  BrowserSoundPlayback,
  SoundDesignController,
  claimAdapterAmbience,
  createSoundDirectorHooks,
  observeNarrationDucking,
} from "./sound/sound-design";
import {
  getResumeScene,
  chapterAccessibleName,
  getTitleAction,
  hasChapterDevOverride,
  isChapterUnlocked,
  splitChapterHeading,
  type ShellView,
} from "./shell";

installSessionChallenge();
claimAdapterAmbience(scenes);

const app = document.getElementById("app")!;
let director: Director | null = null;
let soundDesign: SoundDesignController | null = null;
let stopNarrationObservation: (() => void) | null = null;
const searchParams = new URLSearchParams(window.location.search);
const reviewMode = import.meta.env.DEV && searchParams.get("review") === "1";
const captureMode = import.meta.env.DEV && searchParams.get("capture") === "1";
const hideExperienceUi = captureMode || searchParams.get("ui") === "0";

if (captureMode) document.documentElement.dataset.capture = "true";
if (hideExperienceUi) document.documentElement.dataset.experienceUi = "hidden";

async function disposeSoundDesign(): Promise<void> {
  stopNarrationObservation?.();
  stopNarrationObservation = null;
  const current = soundDesign;
  soundDesign = null;
  await current?.dispose();
}

async function play(sceneId: string, newStory = false) {
  if (director) await director.dispose();
  await disposeSoundDesign();
  if (newStory) resetStoryProgress();
  const nextSoundDesign = new SoundDesignController(new BrowserSoundPlayback());
  const soundHooks = createSoundDirectorHooks(nextSoundDesign);
  const nextDirector = new Director({
    container: app,
    reviewMode,
    ...soundHooks,
    onExit: (target = "title") => {
      director = null;
      void disposeSoundDesign();
      renderShell(target);
    },
  });
  director = nextDirector;
  soundDesign = nextSoundDesign;
  stopNarrationObservation = observeNarrationDucking(app, nextSoundDesign);
  nextSoundDesign.ensure();
  await nextDirector.start(sceneId);
}

function shellHeader(backTarget?: ShellView) {
  return `
    <header class="shell-header">
      ${backTarget ? `<button class="text-button shell-back" data-view="${backTarget}">← Back</button>` : "<span></span>"}
      <p class="shell-wordmark">American Revolution</p>
      <span></span>
    </header>`;
}

function renderTitle() {
  const state = loadState();
  const resumeScene = getResumeScene(scenes, state) ?? scenes[0];
  const resumeHeading = splitChapterHeading(resumeScene.title);
  const titleAction = getTitleAction(scenes, state);
  const complete = titleAction === "Begin Again";

  app.innerHTML = `
    <main class="shell-screen title-screen">
      <div class="paper-grain" aria-hidden="true"></div>
      <section class="title-panel" aria-labelledby="piece-title">
        <p class="title-eyebrow">An interactive documentary · 1773–1783</p>
        <h1 id="piece-title">American Revolution</h1>
        <p class="title-deck">Ten years of uprising, consequence, and ink.</p>
        <div class="title-actions">
          <button class="primary-action" id="begin">
            ${titleAction}
            <span>${resumeHeading.title}</span>
          </button>
          <button class="text-button" data-view="chapters">Chapters</button>
          <button class="text-button" data-view="settings">Settings</button>
        </div>
      </section>
      <p class="title-footnote">Headphones recommended · Progress saves on this device</p>
    </main>`;

  document.getElementById("begin")!.addEventListener("click", () => void play(resumeScene.id, complete));
  bindViewButtons();
}

function renderChapters() {
  const state = loadState();
  const devOverride = reviewMode || hasChapterDevOverride(window.location.search);

  app.innerHTML = `
    <main class="shell-screen chapters-screen">
      ${shellHeader("title")}
      <section class="chapters-heading">
        <p class="title-eyebrow">1773–1783</p>
        <h1>Chapters</h1>
        <p>Choose any chapter. Story progress still saves on this device.</p>
        ${devOverride ? '<p class="dev-notice">Development override active · all chapters unlocked</p>' : ""}
      </section>
      <ol class="chapter-grid">
        ${scenes.map((scene, index) => {
          const heading = splitChapterHeading(scene.title);
          const unlocked = isChapterUnlocked(index, scenes, state, devOverride);
          const completed = state.completedScenes.includes(scene.id);
          const current = state.currentSceneId === scene.id;
          const stateLabel = current ? "Continue" : completed ? "Completed" : unlocked ? "Available" : "Locked";
          return `
            <li>
              <button
                class="chapter-card plate-${(index % 4) + 1}"
                data-scene="${scene.id}"
                ${unlocked ? "" : "disabled"}
                aria-label="${chapterAccessibleName(index + 1, heading, stateLabel)}"
              >
                <span class="chapter-plate" aria-hidden="true"></span>
                <span class="chapter-number">Chapter ${index + 1}</span>
                <strong>${heading.title}</strong>
                <span class="chapter-date">${heading.date}</span>
                <span class="chapter-state">${stateLabel}</span>
              </button>
            </li>`;
        }).join("")}
      </ol>
      ${import.meta.env.DEV && !devOverride
        ? '<a class="dev-override" href="?unlock=chapters">Unlock all chapters for development</a>'
        : ""}
    </main>`;

  bindViewButtons();
  for (const card of app.querySelectorAll<HTMLButtonElement>("[data-scene]:not(:disabled)")) {
    card.addEventListener("click", () => void play(card.dataset.scene!));
  }
}

function renderSettings() {
  app.innerHTML = `
    <main class="shell-screen settings-screen">
      ${shellHeader("title")}
      <section class="settings-panel" aria-labelledby="settings-title">
        <p class="title-eyebrow">Preferences</p>
        <h1 id="settings-title">Settings</h1>
        <div id="settings-hook" class="settings-hook" aria-live="polite">
          <p>Display, subtitle, motion, and input preferences will appear here.</p>
        </div>
      </section>
    </main>`;
  bindViewButtons();
  window.dispatchEvent(new CustomEvent("revolution:settings-open", {
    detail: { container: document.getElementById("settings-hook") },
  }));
}

function bindViewButtons() {
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.addEventListener("click", () => renderShell(button.dataset.view as ShellView));
  }
}

function renderShell(view: DirectorExitTarget | ShellView = "title") {
  switch (view) {
    case "chapters": renderChapters(); break;
    case "settings": renderSettings(); break;
    default: renderTitle();
  }
}

renderShell();
