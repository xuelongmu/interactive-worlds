# Lexington volley capture and edit artifact

This issue-scoped path produces the ignored `public/assets/video/lexington-volley.mp4`
without changing the director, cue engine, application entry point, world-model
renderer, pinned Lexington world, or scene manifest.

## 1. Capture the real trigger view

First confirm that issue #4's GPU-browser pass has replaced the legacy scaffold
zones with visible-world-authored coordinates. The static collider validation
does not establish where the visible trigger line belongs; do not use a capture
from the current scaffold coordinates as the production conditioning frame.

Then run `npm run dev` and open
`http://localhost:5173/spikes/lexington-volley/` in a real Chromium/GPU browser
at a 1664 × 960 viewport. Walk the pinned Lexington splat normally. On first
entry into `trigger-line`, the harness locks controls, captures the same Spark
canvas and camera view the participant was looking at, displays its SHA-256,
and saves a JPEG through the existing dev-only snapshot endpoint. It performs
no world generation, so the five-reroll guard is not consumed.

Do not use a scripted or programmatic camera pose as the production input. The
capture is valid only when it comes from an actual crossing of the authored
trigger line.

## 2. Generate one reversible source take

Use the captured JPEG as the conditioning image for Lingbot World 2's clip API
and the prompt recorded in `pipeline/lexington-volley.edit.json`. Save the raw,
unmixed 20–30 second take to the ignored path
`public/assets/video/lexington-volley-source.mp4`. If Lingbot quality is not
acceptable, use the same frame and prompt with the approved fal video model.

This step is one video take, not a Marble world re-roll. Do not generate a new
Lexington world. Keep violence at middle/long distance, with smoke obscuring
the lines; reject gore, foreground injury, celebratory framing, hands/shadow,
camera shake, strobe-rate flashes, modern objects, or any music.

## 3. Assemble the review candidate

Check prerequisites without making media:

```powershell
npm run pipeline:lexington-volley -- --check
```

Build after selecting the real capture and source take:

```powershell
npm run pipeline:lexington-volley -- `
  --frame snapshots/snap-<timestamp>.jpg `
  --source public/assets/video/lexington-volley-source.mp4
```

The ffmpeg edit opens on the exact captured frame, blends into generated
motion over 180 ms, discards the generated clip's audio, and mixes only the
existing Lexington dawn bed plus `musket-volley.mp3`. That SFX's pipeline
provenance specifies the first shot, ragged volley, restrained distant screams,
field drum, and no music. The output review JSON records every input/output
hash, media probe, prompt, provenance, and the still-pending director veto.

## Blocked-path resolution options

1. Attach a 1664 × 960 controllable Chromium/GPU preview and provide
   `REACTOR_API_KEY`; after issue #4's visible-zone authoring lands, capture the
   walk and record one Lingbot take end to end.
2. Have the director/operator make only the trigger crossing in this harness,
   then return the saved JPEG; generation and the deterministic edit can run
   separately without replaying the splat.
3. Provide a Lingbot-generated raw take conditioned on the saved JPEG; run the
   local deterministic edit and post its review JSON/hash for async veto.
4. If Lingbot's first conditioned take fails the restrained-quality gate, use
   the same frame/prompt once with fal video and retain both raw hashes for the
   director's reversible comparison.

None of these paths constitutes director approval or by-eye acceptance. Keep
issue #7 open until the actual trigger-crossing match cut is reviewed.
