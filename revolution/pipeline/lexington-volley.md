# Lexington volley capture and edit artifact

This issue-scoped path produces the ignored `public/assets/video/lexington-volley.mp4`
without changing the director, cue engine, application entry point, world-model
renderer, pinned Lexington world, scene manifest, or cue timing.

## Deliverables and ownership

The local handoff is intentionally ignored by Git. A complete issue #7 bundle
contains all five files below; the JSON is the machine-readable inventory for
the other four.

| Artifact | Required properties |
|---|---|
| `snapshots/lexington-trigger-frame.jpg` | 1664x960 real trigger crossing; exact camera/world provenance from issue #4 |
| `public/assets/video/lexington-volley-source.mp4` | Raw 20-30s Lingbot clip conditioned on that JPEG; generated audio is not used |
| `public/assets/video/lexington-volley.mp4` | Final H.264/AAC review candidate, up to 25s, 1664x960 at 30fps |
| `public/assets/video/lexington-volley.review.jpg` | Five-frame contact sheet covering the match cut, both SFX stages, and aftermath |
| `public/assets/video/lexington-volley.handoff.json` | Exact paths, durations, probes, SHA-256 hashes, prompt, edit notes, and review state |

Issue #4 exclusively owns the visible-world trigger line and authoritative
capture. Issue #43 exclusively owns the SFX assets and their ear review. Issue
#45 owns director/cue timing. This workflow consumes their handoffs without
editing zones, SFX mappings, the scene manifest, the director, or cue timing.

## 1. Capture the real trigger view

First confirm that issue #4's GPU-browser pass has replaced the legacy scaffold
zones with visible-world-authored coordinates. The static collider validation
does not establish where the visible trigger line belongs; do not use a capture
from the current scaffold coordinates as the production conditioning frame.

The old world `dc292531-9d06-4f95-851c-0ebc32a3c73b` is stale and must not be
used for production capture. After issue #4 provides its selected/pinned world,
run `npm run dev` and open
`http://localhost:5173/spikes/lexington-volley/` in a real Chromium/GPU browser
at a 1664x960 viewport. Walk the pinned Lexington splat normally. On first
entry into `trigger-line`, the harness locks controls, captures the same Spark
canvas and camera view the participant was looking at, displays its SHA-256,
and saves a JPEG through the existing dev-only snapshot endpoint. It performs
no world generation, so the five-reroll guard is not consumed.

Do not use a scripted or programmatic camera pose as the production input. The
capture is valid only when it comes from an actual crossing of the authored
trigger line. Never substitute the trusted PR #41 reference frame for the
participant's real trigger-crossing view; it is an art input, not continuity
evidence.

## 2. Generate one reversible source take

Use the captured JPEG as the conditioning image for Lingbot World 2's clip API
and the prompt recorded in `pipeline/lexington-volley.edit.json`. Request the
session recording through the SDK (`requestRecording`/`downloadClipAsFile`) and
save the raw, unmixed 20-30 second take to the ignored path
`public/assets/video/lexington-volley-source.mp4`. If Lingbot quality is not
acceptable, use the same frame and prompt with the approved fal video model.

This step is one video take, not a Marble world re-roll. Do not generate a new
Lexington world. Keep violence at middle/long distance, with smoke obscuring
the lines; reject gore, foreground injury, celebratory framing, hands/shadow,
camera shake, strobe-rate flashes, modern objects, or any music.

## 3. Assemble the review candidate

Copy the authoritative issue #43 handoff for `LEX-SFX-001` to
`public/assets/audio/sfx/lexington-first-shot.mp3`. Do not generate a substitute.
The pipeline also pins the immutable `LEX-SFX-002` baseline at
`public/assets/audio/sfx/musket-volley.mp3` to SHA-256
`b5b74d6f3dcdfe3d02648ff9f86cc788105203acc2c40462e20e28f48bc49eae`.

Check prerequisites without making media:

```powershell
npm run pipeline:lexington-volley -- --check
```

Build after selecting the real capture and source take:

```powershell
npm run pipeline:lexington-volley -- `
  --frame snapshots/snap-<timestamp>.jpg `
  --source public/assets/video/lexington-volley-source.mp4 `
  --isolated-shot public/assets/audio/sfx/lexington-first-shot.mp3
```

The ffmpeg edit opens on the exact captured frame, blends into generated
motion over 180ms, and discards the generated clip's audio. The existing 220ms
edit lead-in starts `LEX-SFX-001`; the pipeline probes that asset and starts
`LEX-SFX-002` only when its full report and echo end. It then enforces at least
four seconds of authored silence before the cutscene ends. The only other
source is the quiet Lexington dawn bed, which ends with the volley. There is
no narration or music.

The output handoff JSON records every input/output hash, media probe, prompt,
audio boundary, provenance note, and still-pending director veto. The contact
sheet is evidence for by-eye review, not approval by itself. Review the actual
MP4 for continuity at the five recorded checkpoints, historical plausibility,
the violence ceiling, flash/camera comfort, modern-object leakage, and any
speech or score leakage. Record only observations actually made; do not change
the generated `directorStatus` without the director's async-veto decision.

## Blocked-path resolution options

1. Attach a 1664x960 controllable Chromium/GPU preview and provide
   `REACTOR_API_KEY`; after issue #4's visible-zone authoring lands, capture the
   walk and record one Lingbot take end to end.
2. Have the director/operator make only the trigger crossing in this harness,
   then return the saved JPEG; generation and the deterministic edit can run
   separately without replaying the splat.
3. Provide a Lingbot-generated raw take conditioned on the saved JPEG; run the
   local deterministic edit and post its handoff JSON/hash for async veto.
4. If Lingbot's first conditioned take fails the restrained-quality gate, use
   the same frame/prompt once with fal video and retain both raw hashes for the
   director's reversible comparison.

None of these paths constitutes director approval or by-eye acceptance. Keep
issue #7 open until the actual trigger-crossing match cut is reviewed.
