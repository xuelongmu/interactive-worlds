# Delaware fallback capture and verification

This runbook is the reproducible residual for issue #6. The timed beat,
fallback, and scene-handoff mechanisms already exist; this procedure produces
and verifies the one missing curated take without changing those mechanisms.

## Prerequisites

- A real Chromium browser with GPU video/WebRTC support.
- A configured `REACTOR_API_KEY`; never paste or expose its value in logs or a
  pull request.
- Available Reactor session credit.
- The conditioning frame at the repo-relative path
  `public/reference/delaware.jpg`.
- `ffprobe` on `PATH` for deterministic media inspection.

From `revolution/`, start the existing review build:

```powershell
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/spikes/worldmodel/`.

## Capture one take

1. With `public/reference/delaware.jpg` present, leave the file chooser empty so
   the harness loads the manifest's reference image, or choose that repo-relative
   file explicitly. Then select **Connect & start generation**. Do not continue
   unless the page reaches `ready` and real frames flow.
2. Drive with WASD and the arrow keys. Keep the embodied hands and pole in view,
   maintain a coherent forward crossing, and avoid abrupt camera reversals.
3. Confirm the automatic log sequence below. Do not press the manual beat
   buttons during a capture.

   | Scene time | Event | Expected result |
   | ---: | --- | --- |
   | 45s | `knox` | `DEL-031` cue |
   | 90s | `storm` | storm prompt hot-swap and `DEL-032` cue |
   | 180s | `landing` | shore prompt hot-swap and `DEL-040` cue |
   | 215s | `column-formed` | `DEL-041` cue and Trenton handoff marker |

4. Accept only a restrained, coherent take: first-person hands remain plausible;
   boat, passengers, river, ice, and distant boats remain stable; the storm and
   landing visibly arrive near their authored beats; there are no modern
   objects, close violence, or gore. Stop and flag the prompt/frame after five
   unacceptable attempts.
5. After `column-formed` and `cue DEL-041 -> scene:trenton` appear in the log,
   select **Save recording (.mp4)**. Keep the session connected while the button
   says `Fetching recording...`. Wait until the event log contains
   `recording saved` and the browser reports the download is complete. Only then
   select **Disconnect (ends the session)**. Do not inspect or move the
   download until the disconnect finishes.
6. Preserve the download while placing the candidate at the ignored target:

```powershell
New-Item -ItemType Directory -Force -Path .\public\assets\video
Copy-Item -LiteralPath "$env:USERPROFILE\Downloads\delaware-crossing.mp4" `
  -Destination .\public\assets\video\delaware-crossing.mp4
node .\scripts\verify-delaware-fallback.mjs
```

The verifier prints the exact path and SHA-256, checks the MP4/H.264 stream and
duration, confirms the four manifest times and cue mappings, confirms the
Trenton handoff, and ensures the bulky media remains ignored. The take must be
at least 216 seconds so the 215-second final cue is reachable.

## Verify the actual fallback path

1. In Chromium DevTools, block only the `*/api/session` request. Leave local
   asset requests enabled.
2. Open the app root and choose **Crossing the Delaware** from the dev chapter
   list. Confirm the pre-rendered take starts instead of a live session.
3. Watch the subtitles at 45, 90, 180, and 215 seconds and confirm they match
   `DEL-031`, `DEL-032`, `DEL-040`, and `DEL-041`. Confirm the final cue hands
   off to Trenton.
4. Exit the scene, remove the request block, and close the page. Confirm no live
   Reactor session remains connected.

This browser pass is required. Static manifest checks, a successful build, or
an MP4 checksum do not substitute for it.

## Current blocked-state resolution options

1. Run this procedure in an AO session with the in-app GPU browser available;
   it keeps capture, visual review, and fallback verification in one auditable
   session.
2. Have the director run the procedure locally and provide the ignored MP4 plus
   verifier output; the worker can then confirm metadata and open a follow-up
   verification session.
3. Restore the AO browser backend for this session, then rerun from the same
   branch; no code rebase or engine edit is required.
4. Use a supervised local Chromium session with screen sharing and retain the
   event log screenshots; this provides human visual evidence but requires a
   later automated fallback pass for parity.
