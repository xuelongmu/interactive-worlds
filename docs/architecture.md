# Technical Architecture — American Revolution Interactive Story

Browser-based interactive documentary combining three render registers:

| Register | Tech | Runtime? |
|---|---|---|
| Witness | World Labs gaussian splats, rendered via **Spark** (three.js) | Baked `.spz` files |
| Participant | Reactor / Lingbot World 2 streamed world model | **Live** (WebRTC) + mp4 fallback |
| Actor | three.js gameplay scenes with **Tripo**-generated GLB assets | Baked |
| Audio | **ElevenLabs** VO / SFX / ambience | Baked per-cue files |

## Governing decisions

### 1. Bake everything except the world model
World Labs, Tripo, and ElevenLabs are *content tools*, invoked only by offline
pipeline scripts. Their output ships as static files on a CDN. Only Reactor runs
at viewer time. Consequences:

- No API keys in the client; no per-viewer cost except world-model sessions.
- Deterministic quality — every asset is curated, not generated live.
- One failure domain: if Reactor is down, Participant beats play their
  pre-rendered fallback and the experience still completes.
- Narration is **never** synthesized at runtime. Per-cue files, named by cue ID.

### 2. One engine, two surfaces
Spark renders splats inside three.js, so splat scenes and gameplay scenes share
one WebGL canvas, one camera/input system, one trigger-volume system, one
transition system. The client has exactly two visual surfaces:

1. **Canvas** — three.js (Spark splats + gameplay scenes)
2. **Video** — world-model WebRTC stream, or its mp4 fallback

The director cross-fades between them. Transitions are *audio-first*: manifests
mark an out-line cue; the visual cut lands on its last word.

### 3. The script is the data model
Scenes are declarative JSON **manifests**; the beat-by-beat script (narration +
sound cues) compiles into them. Story lives in content, not code.

```json
{
  "id": "lexington",
  "renderer": "splat",
  "assets": { "splat": "worlds/lexington-dawn.spz", "collision": "worlds/lexington-nav.glb" },
  "zones": [ { "id": "militia-line", "shape": "box", "pos": [0,0,0], "size": [10,3,2] } ],
  "cues": [
    { "id": "LEX-020",
      "trigger": { "type": "zone-enter", "zone": "militia-line" },
      "vo": "vo/LEX-020.mp3", "subtitle": "Farmers, mostly...",
      "once": true, "duck": ["ambience"] },
    { "id": "LEX-060",
      "trigger": { "type": "zone-enter", "zone": "gap-line", "orTimer": 240 },
      "lockControls": true, "then": "cutscene:volley" }
  ],
  "audio": { "ambience": ["amb/green-dawn.mp3"] },
  "next": { "scene": "declaration", "preloadAt": "LEX-080" }
}
```

## Client modules

```
app/
  engine/
    director.ts      # scene state machine, transitions, preloading
    cues.ts          # trigger evaluation, priority, queueing, once-flags
    audio.ts         # Web Audio buses, ducking, spatialization, subtitles
    state.ts         # IndexedDB story state (signature, progress)
  renderers/
    splat.ts         # Spark scene + collision/nav mesh + trigger volumes
    gameplay.ts      # three.js interactive scenes (signing, sand tables)
    worldmodel.ts    # Reactor session, input mapping, event hooks, fallback
  scenes/            # per-scene manifests (JSON) + any scene-specific code
```

- **Director** — loads scenes, runs transitions, preloads the next scene's
  assets during the current one (linear order makes prediction exact).
- **Cue engine** — renderer-agnostic. All renderers emit one normalized event
  vocabulary: `zone-enter`, `dwell`, `action`, `model-event`, `timer`.
  Handles priority (diegetic queues behind narrator, never interrupts
  mid-sentence), once-flags, ducking directives.
- **Audio engine** — Web Audio, four buses: narration / diegetic / ambience /
  music. Sidechain ducking (−6 dB under narrator). PannerNode spatialization
  for diegetic voices in 3D scenes. Subtitles rendered from cue text.
- **Splat renderer** — Spark + invisible collision/walkable mesh per world
  (splats have no colliders; author a crude nav mesh + trigger volumes with an
  in-app debug overlay mode).
- **Gameplay renderer** — three.js; Tripo GLBs preprocessed offline
  (meshopt/Draco + KTX2). Signing scene captures the signature as
  **vector strokes** (not bitmap) so the finale can re-render it aged.
- **World-model renderer** — Reactor session lifecycle:
  1. POST `/api/session` → short-lived JWT (server-held API key)
  2. Attach WebRTC video track to the video surface
  3. Map pointer/keys → model movement commands
  4. Surface scripted beats (storm, landing) as `model-event`s to the cue engine
  5. **Fallback:** every Participant beat ships a pre-rendered mp4; play it if
     session setup fails or latency exceeds budget. Degraded, never broken.

**Continuity trick:** on splat → world-model transitions, capture the final
rendered frame of the splat camera and use it as the world model's image
conditioning / start frame. The frozen world "wakes up" in place (the Tea Party
beat depends on this).

## Server

- Static hosting + CDN for app and all baked assets.
- One serverless endpoint: `POST /api/session` — mints short-lived Reactor
  tokens. API key lives only here. No database; story state is client-side.

## Offline pipeline (`pipeline/`, Node scripts — where API keys live)

| Script | Service | Output |
|---|---|---|
| `frames` | fal (GPT Image 2) | starting frames: Reactor conditioning images (native 1664×960) + Marble image prompts |
| `vo` | ElevenLabs TTS | `assets/audio/vo/<CUE-ID>.mp3` per script cue |
| `sfx` | ElevenLabs SFX | ambience beds, event sounds per sound-cue list |
| `worlds` | World Labs | `.spz` splats + metadata (entry pose, scale) |
| `models` | Tripo | compressed GLBs |

- Source of truth = script markdown + manifests; pipeline reconciles like IaC.
- Content-hash (text, voice, settings) per asset → a one-line rewrite
  regenerates one file.
- `worlds` stays curatorial: pipeline tracks versions, a human picks the take.

## Asset weight

Splats are the heavy item (tens–~200 MB per scene as `.spz`). Mitigations:
- Preload next scene during current scene.
- Chapter title cards with narration over black as honest loading screens.
- First-load budget: shell + prologue only; the rest streams behind the story.

## Spike results (2026-07-18)

Both spikes implemented in `revolution/` and validated live:

- **World model:** Lingbot World 2 session via `@reactor-models/lingbot-world-2`
  through the token broker. Connect 1.9–5.3 s; first frame ~6.7 s;
  **command → next chunk ~61 ms**; 1664×960 @ ~46 fps delivered. Prompt
  hot-swap steers mid-generation → confirmed as the scripted-beat mechanism
  (model-event → cue engine → subtitle, end-to-end). Protocol notes: wait for
  status `ready` before `uploadFile`; wait for `conditions_ready` before
  `start` (image decodes server-side).
- **Splat:** Spark `SplatMesh` renders inside the shared three.js shell.
  Locomotion + trigger zones + cue engine + ducking verified. Marble's API
  returns a **collider mesh** per world (plus `metric_scale_factor` /
  `ground_plane_offset`), so walkable ground needs no hand authoring —
  the renderer raycasts the collider directly.

## Build order (by risk)

1. **Spike 1 — world model** (highest uncertainty): controllable Delaware boat
   beat on Reactor/Lingbot 2. Tests: steerable water/ice, latency budget
   (~150 ms), scripted event hooks, image conditioning from a supplied frame.
   Outcome decides ambition level of all Participant scenes.
2. **Spike 2 — splat quality:** Lexington Green in World Labs. Tests: fidelity
   at human eye-height; walkable extent big enough for two lines 60 yards apart.
3. **M1:** shell + director + cue engine + audio engine; Lexington playable
   end-to-end (volley cutscene as pre-rendered video). Proves the grammar.
4. **M2:** Declaration signing — three.js interaction + signature persistence.
5. **M3:** Delaware live world model + fallback path.
6. **M4:** pipeline hardened; remaining scenes become script + assets, not
   engineering.

## Note on repo contents

`austerlitz/` is a downloaded third-party sample (Reactor-based) kept for
reference only. The one pattern retained from it is the local token broker
(`/api/session`). Nothing else in this architecture derives from it.
