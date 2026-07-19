# interactive-worlds

Experiments in interactive, immersive storytelling built on generative worlds.

Current project: **The Revolution** — an interactive documentary of the
American Revolution (1773–1783) told through three render registers:

- **Witness** — walkable gaussian-splat scenes (World Labs Marble, rendered with Spark)
- **Participant** — live world-model sequences (Reactor / Lingbot World 2)
- **Actor** — precise three.js interactions with Tripo-generated props

with ElevenLabs narration and sound design, and fal (GPT Image 2) starting
frames conditioning both world generators.

| Path | What |
|---|---|
| `docs/architecture.md` | technical architecture + spike results |
| `docs/narration-scripts.md` | cue-based narration scripts (three scenes) |
| `revolution/` | the app: engine, renderers, scene manifests, spikes, asset pipeline |

See `revolution/README.md` to run it.
