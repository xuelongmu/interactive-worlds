# interactive-worlds

Experiments in interactive, immersive storytelling built on generative worlds.

Current project: **American Revolution** — an interactive documentary
(1773–1783) told through three render registers:

- **Witness** — walkable gaussian-splat scenes (World Labs Marble, rendered with Spark)
- **Participant** — live world-model sequences (Reactor / Lingbot World 2)
- **Actor** — precise three.js interactions with Tripo-generated props

with ElevenLabs narration and sound design, and fal (GPT Image 2) starting
frames conditioning both world generators.

## Technology

| Area | Technology |
|---|---|
| Frontend | TypeScript, Vite, three.js |
| Immersive world rendering | Spark, World Labs Marble |
| Generative world model | Reactor SDK, Lingbot World 2 |
| Asset generation | fal GPT Image 2, Tripo, ElevenLabs |
| Backend and deployment | Vercel Functions, Upstash Redis, Cloudflare Turnstile |
| Testing | Node.js test runner, Vitest |

## Project structure

| Path | What |
|---|---|
| `docs/gdd.md` | game design document (creative source of truth) |
| `docs/decisions.md` | binding director decisions |
| `docs/architecture.md` | technical architecture + spike results |
| `docs/deployment.md` | production hosting, session broker, and large-asset strategy |
| `docs/narration-scripts.md` | cue-based narration scripts (three scenes) |
| `revolution/` | the app: engine, renderers, scene manifests, spikes, asset pipeline |

See `revolution/README.md` to run it.
