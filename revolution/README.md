# American Revolution — interactive story

Browser-based interactive documentary of the American Revolution.
Director decisions binding on all work: [../docs/decisions.md](../docs/decisions.md).
Three render registers: **Witness** (World Labs splats via Spark),
**Participant** (Reactor / Lingbot World 2), **Actor** (three.js + Tripo),
with ElevenLabs narration/sound. See [../docs/architecture.md](../docs/architecture.md)
and [../docs/narration-scripts.md](../docs/narration-scripts.md).

## Run

```powershell
npm install
npm run dev
```

- `/` — shell / chapter menu
- `/spikes/worldmodel/` — **Spike 1**: live Lingbot World 2 session (Delaware boat)
- `/spikes/splat/` — **Spike 2**: walkable splat + cue zones (Lexington)

Keys go in `revolution/.env` (or the parent workspace `.env`) — see
`.env.example`. Only `REACTOR_API_KEY` is needed to run Spike 1; the rest are
pipeline-time keys.

## Spike results (2026-07-18)

**Spike 1 — world model.** Live session through the dev token broker
(`/api/session`; API key stays server-side). Measured: connect ≈ 1.9–5.3 s,
first frame ≈ 6.7 s after click, **input command → next chunk ≈ 61 ms**,
stream 1664×960 at ~46 fps delivered. Prompt hot-swap works mid-generation and
is the scripted-beat mechanism (Storm/Landing buttons → `model-event` →
cue → subtitle, end-to-end). Two protocol gotchas handled in
`src/renderers/worldmodel.ts`: wait for status `ready` before uploading, and
wait for `conditions_ready` (image decoded server-side) before `start`.

**Spike 2 — walkable splat.** Spark renders inside our three.js shell; WASD +
pointer-lock walk, box trigger zones fire `zone-enter` → cue engine → subtitle
with ambience ducking; `Z` toggles the zone-authoring debug overlay. Runs
against a placeholder sample splat until `pipeline:worlds` generates the real
Lexington world (Marble also returns a **collider mesh**, which the renderer
already consumes for ground-height raycasts).

## Pipeline (offline asset generation)

```powershell
npm run pipeline:frames   # fal GPT Image 2 → starting frames                (FAL_KEY)
npm run pipeline:worlds   # Marble 1.1 Plus → *.spz + colliders             (WORLDLABS_API_KEY)
npm run pipeline:vo       # narration-scripts.md → per-cue VO mp3s           (ELEVENLABS_API_KEY + voice id)
npm run pipeline:sfx      # ambience beds + event SFX                        (ELEVENLABS_API_KEY)
npm run pipeline:models   # Tripo → GLB props for gameplay scenes           (TRIPO_API_KEY)
```

Run `pipeline:frames` before `pipeline:worlds`: the frames are both the
Reactor conditioning images (generated at Lingbot's native 1664×960) and the
Marble image prompts (uploaded as media assets; the text prompt rides along).
Pin a Marble take you like by pasting its world id into
`pipeline/worlds.config.mjs`.

All scripts are content-hashed (re-runs only regenerate what changed) and
no-op with instructions when their key is missing.
`npm run pipeline:vo -- --dry-run` (note the `--` npm needs to pass args
through) shows the parsed cue list without calling the API.

## Production deployment

Vercel builds this directory as a Vite static app and deploys
`api/session.ts` as the server-only Reactor token broker. Production token
minting requires a one-time Turnstile challenge and an atomic Upstash Redis
admission check for replay, per-client rate, and global daily budget. Generated
media and conditioning references stay outside the app deployment in versioned
object storage/CDN releases because a single splat can approach 200 MB. See
[production deployment](../docs/deployment.md) for fresh-clone setup, secret
handling, asset publishing, verification, and the external account steps that
must be completed before claiming a public world-model run.

## Layout

```
src/engine/      director, cue engine, audio buses, story state
src/renderers/   splat (Spark), worldmodel (Reactor), gameplay (three.js, M2)
src/scenes/      scene manifests — the script compiled to data
spikes/          the two review builds
pipeline/        Marble / ElevenLabs / Tripo generation scripts
public/assets/   generated assets (git-ignorable, reproducible)
```
