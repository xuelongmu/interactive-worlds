import "./walkthrough.css";

const app = document.getElementById("app")!;

if (!import.meta.env.DEV) {
  app.innerHTML = `
    <main class="dev-unavailable">
      <p class="eyebrow">Development route</p>
      <h1>Mechanics walkthrough unavailable</h1>
      <p>This review surface is intentionally disabled outside the Vite development server.</p>
    </main>`;
} else {
  void import("./walkthrough")
    .then(({ mountMechanicsWalkthrough }) => mountMechanicsWalkthrough(app))
    .catch((error) => {
      app.innerHTML = `<main class="dev-unavailable"><h1>Walkthrough failed to mount</h1><pre></pre></main>`;
      app.querySelector("pre")!.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
    });
}
