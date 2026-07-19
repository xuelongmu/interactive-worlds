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

### Reactor capacity fallback

LingBot World 2 remains the default. To move one browser immediately to the
compatible legacy LingBot runtime, append `?reactorModel=lingbot` to any app
URL and reload. Use `?reactorModel=lingbot-world-2` to switch back. To select a
deployment-wide build default, set `VITE_REACTOR_MODEL=reactor/lingbot` (or
`reactor/lingbot-world-2`) before building. Use `?reactorModel=helios` for a
seed-image, prompt-steered cinematic fallback. Helios keeps E/F narrative
actions but intentionally disables WASD, mouse look, and their HUD hints. The
server allowlists these three values and scopes each short-lived JWT to the
selected model.

Legacy LingBot supports the same seed-image, prompt, live video, WASD, and look
flow used here, but it has a single movement direction at a time: when a user
holds forward/back and strafe together, forward/back wins. SANA Streaming is
not exposed by this switch because it is a video-to-video model requiring an
inbound source stream, not a navigable seed-image world.

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
minting first requests an HttpOnly browser clearance: the initial POST returns
`428 challenge_required`, one Turnstile exchange sets the hardened cookie and
returns a JWT, and later POSTs reuse server-validated clearance without another
widget. Every mint still passes atomic Upstash Redis per-client and global
admission. Generated media and conditioning references stay outside the app
deployment in versioned object storage/CDN releases because a single splat can
approach 200 MB. See [production deployment](../docs/deployment.md) for the
clearance expiry/revocation contract, fresh-clone setup, secret handling, asset
publishing, verification, and external account steps.

## Layout

```
src/engine/      director, cue engine, audio buses, story state
src/renderers/   splat (Spark), worldmodel (Reactor), gameplay (three.js, M2)
src/scenes/      scene manifests — the script compiled to data
spikes/          the two review builds
pipeline/        Marble / ElevenLabs / Tripo generation scripts
public/assets/   generated assets (git-ignorable, reproducible)
```
