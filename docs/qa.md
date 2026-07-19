# Release QA drills

Run this checklist for every release candidate. It is an evidence template, not
a standing claim that a build passed. Copy the empty run record below into the
release artifact, fill every field, and link a bug for every failure or browser
divergence.

## Run record

| Field | Value |
| --- | --- |
| Build commit and deployment URL | |
| Tester and date/time zone | |
| Asset release/version | |
| Reactor account/dashboard | |
| Start/end active Reactor sessions | |
| Test-day start/end time | |
| Automated check output | |
| Evidence folder or report URL | |

Allowed result values are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`. A drill is
`PASS` only when its expected result and evidence have both been recorded.
Static tests do not replace real-browser or Reactor-dashboard checks.

## Before the browser pass

From `revolution/`, run:

```powershell
npm test
npm run test:server
npm run typecheck
npm run build
```

Use a deployment with its exact commit visible in the evidence. Confirm the
Delaware conditioning image and fallback MP4 return their expected media types
rather than the SPA HTML fallback. Keep DevTools Console and Network logs, and
enable **Preserve log**. Record the Reactor dashboard's active-session count
before creating the first live session.

## Fallback drills

Run all four drills in Chromium first. Repeat browser-sensitive behavior in the
browser matrix. Reset request blocking and throttling after each drill.

### F1 — terminate Reactor during Delaware

1. Start **Crossing the Delaware** with a live Reactor session and wait for
   moving frames and control.
2. Note the scene clock and next authored model event. In the Reactor dashboard,
   terminate that exact session.
3. Keep the tab focused and do not reload.
4. Confirm the prerecorded Delaware video replaces the live stream without an
   error surface or spinner and resumes at the same scene time.
5. Confirm elapsed cues do not replay, the next cue fires once at its authored
   time, subtitles remain synchronized, and `DEL-041` still hands off to
   Trenton.
6. Confirm the terminated session disappears from the dashboard.

Evidence: a preserved console/network log, dashboard session identifier, and a
screen recording spanning termination through the next cue.

| Result | Kill time | Fallback time | Next cue/time | Dashboard clear time | Bug/evidence |
| --- | ---: | ---: | --- | --- | --- |
| NOT RUN | | | | | |

### F2 — block session creation

1. In DevTools request blocking, add `*/api/session`.
2. Start Delaware from a fresh chapter load.
3. Confirm the title card remains the loading surface, with status text and no
   spinner or raw error.
4. Confirm the fallback begins from the start and the cue sequence reaches
   Trenton.
5. Confirm the Reactor dashboard created no session.

| Result | First fallback frame | Cue sequence | Sessions before/after | Bug/evidence |
| --- | --- | --- | --- | --- |
| NOT RUN | | | | |

### F3 — Slow 3G during a chapter transition

1. Start a chapter at normal speed.
2. Before its final transition cue, set DevTools network throttling to
   **Slow 3G** and disable the HTTP cache.
3. Trigger the next chapter.
4. Confirm the outgoing scene ends normally and the next chapter title card
   holds while assets prepare. There must be no spinner, blank application
   shell, or exposed fetch error.
5. Confirm the prepared live scene or its fallback eventually replaces the
   title card and its first cue is not skipped.
6. Restore normal networking and complete the chapter.

| Result | From → to | Hold duration | Loaded mode | First cue | Bug/evidence |
| --- | --- | ---: | --- | --- | --- |
| NOT RUN | | | | | |

### F4 — remove one narration file

Use a generated local asset or an isolated staging asset release. Never remove
a shared production object. Temporarily rename one cue MP3 so its URL returns a
real `404`:

```powershell
Rename-Item -LiteralPath .\public\assets\audio\vo\<CUE>.mp3 -NewName <CUE>.mp3.qa-disabled
```

Confirm the subtitle appears for its estimated reading time, the scene remains
interactive, ambience returns after the line, and the next cue advances. Then
restore the file:

```powershell
Rename-Item -LiteralPath .\public\assets\audio\vo\<CUE>.mp3.qa-disabled -NewName <CUE>.mp3
```

| Result | Cue | 404 observed | Subtitle duration | Next cue | File restored | Bug/evidence |
| --- | --- | --- | ---: | --- | --- | --- |
| NOT RUN | | | | | | |

## Black-frame and loading behavior

When neither a live session nor fallback media is available, confirm the scene
holds black while the cue clock advances. It must not expose a spinner, broken
video icon, exception, or dead-end navigation. Confirm `boarded`,
`control-granted`, authored model events, subtitles, pause, and the next-scene
handoff still occur once. This is a last-resort development path, not a
substitute for shipping the fallback MP4.

## Browser matrix

Run a complete Prologue-to-Treaty playthrough in current stable Chrome, Edge,
Firefox, and Safari. Safari must be tested on macOS; emulation or a Chromium
user-agent override is not Safari evidence. Record exact browser, OS, and GPU.

For every browser, verify:

- WebRTC: Reactor connects, responds to input, and F1/F2 degradation works.
- Web Audio: all buses play; narration ducks intended beds; pause/resume retains
  position; missing VO is subtitle-only.
- Pointer lock: gesture enters lock, Escape releases it, resume can reclaim it,
  and scene exit leaves no listener or lock behind.
- Spark/WebGL: splats render at the authored entry view, colliders work, and
  shader errors, context losses, or visual/performance differences are logged.
- Fallback video: MP4 decoding, seek-on-live-loss, subtitle timing, and chapter
  handoff work.

| Browser | Version / OS / GPU | Full arc | WebRTC | Web Audio | Pointer lock | Spark/WebGL | Fallback | Bug/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome | | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | |
| Edge | | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | |
| Firefox | | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | |
| Safari | | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | |

For every divergence, record the first failing chapter, console/network log,
browser/OS/GPU, reproduction steps, expected and actual behavior, and whether a
fallback remained usable. File the bug before marking the matrix complete.

## Pointer, pause, chapter, and story-state torture

Use an ordinary profile, not private browsing. Record the stored
`revolution-story-state` value before and after each state action.

| Drill | Expected result | Result | Bug/evidence |
| --- | --- | --- | --- |
| Escape during every renderer | Pause opens once; scene input/audio/timers stop | NOT RUN | |
| Resume by mouse and keyboard | Focus returns; audio/timers retain position; held input is safe | NOT RUN | |
| Restart / chapter select while paused | Old renderer, pointer lock, audio, timers, and session tear down first | NOT RUN | |
| Refresh during every scene | Continue returns to that chapter; completed progress remains | NOT RUN | |
| Resume with each chapter current | Continue opens that exact chapter | NOT RUN | |
| Resume after each completion | Continue opens the first unfinished chapter | NOT RUN | |
| Begin Again | Completed, current, and signature state are empty | NOT RUN | |
| Refuse the Declaration signature | Treaty shows only the historical document and conditional cue | NOT RUN | |
| Sign, then complete the arc | Signature vectors persist and the aged signature appears at Treaty | NOT RUN | |

As a corrupted-storage check, replace the story-state value with invalid JSON,
reload, and confirm a clean default state without an uncaught error. Restore or
clear the test value afterward.

## Reactor session-hygiene audit

Use unique dashboard session identifiers and never infer cleanup from a closed
video element. For each case, start confirmed live Delaware, record its ID,
perform the exit, refresh the dashboard through its normal reporting interval,
and record when the session ceases to be active.

| Exit path | Client observation | Dashboard observation | Result | Bug/evidence |
| --- | --- | --- | --- | --- |
| Normal scene handoff | Live stream stops before next renderer | Session inactive | NOT RUN | |
| Pause → chapter select | Video/audio/input hooks stop | Session inactive | NOT RUN | |
| Restart | Old ID ends before/recently after replacement starts | No old orphan | NOT RUN | |
| Failed connect / timeout | Fallback starts | Partial session inactive | NOT RUN | |
| Remote kill | Fallback starts at live clock | Killed ID inactive | NOT RUN | |
| Reload | Old stream stops | Old ID inactive | NOT RUN | |
| Close tab | Tab closes without prompt | Session inactive | NOT RUN | |
| Browser crash/forced close | Browser process ends | Session inactive | NOT RUN | |

Capture the dashboard's active-session list at test-day start and end.
Acceptance is zero session IDs from the day's runs still active. An orphan is a
billing-safety failure: stop paid drills, terminate it manually, file a P1 bug
with timestamps and session ID, and preserve dashboard evidence.

## Recorded verification baseline — 2026-07-19

Target: `origin/main` at `d49f5c3`, Windows 10.0.26200, Node 24.14.0,
npm 11.9.0.

- `npm test`: PASS (38 Node tests + 18 Vitest tests).
- `npm run test:server`: PASS (15 tests).
- `npm run typecheck`: PASS.
- `npm run build`: PASS; existing large Spark/Three chunk warning only.
- Focused pause, pointer-lock, state, and shell run: PASS (15 tests).
- Temporary main-only QA probe: five contracts passed for failed-connect
  fallback, black-frame clock, pause idling, explicit dispose/disconnect, and
  missing-VO subtitle/audio continuity.
- Browser matrix: `BLOCKED`. AO exposed no in-app browser backend before or
  after opening the local preview. No screenshots or device claims were made.
- Live Reactor/dashboard and Delaware media drills: `NOT RUN`. The detached
  checkout had neither `delaware.jpg` nor `delaware-crossing.mp4`; no session or
  billing claim was made.
- Remote-loss probe: `FAIL` on main (one failed, five passed): an established
  player has no mid-session fallback transition. The exact patch and reproducer
  were routed to the owner in [issue #37](https://github.com/xuelongmu/interactive-worlds/issues/37).
  The owner-controlled fix is evidence only and is not part of this QA delta.

## Recorded PR interaction connector outage — 2026-07-19

These checks were assigned as read-only acceptance gates for PRs #42 and #49.
The local servers and AO preview opened successfully, but the permitted browser
connector exposed no browser. This is reproducible blocker evidence, not a test
result:

| Target | HTTP evidence | AO preview | Browser inventory | Result |
| --- | --- | --- | --- | --- |
| PR #42 `http://localhost:41742` | 200, `text/html`, 392 bytes | succeeded | `[]` | BLOCKED / NOT RUN |
| PR #49 `http://127.0.0.1:5197/spikes/signing/` | 200, `text/html`, 925 bytes | succeeded | `[]` | BLOCKED / NOT RUN |

Because the browser inventory was empty after each preview, no DOM controls,
audio state, human-audible result, screenshots, cue timestamps, or
`revolution-story-state` inspection was claimed. Do not retry these checks until
a real browser is attached. Do not substitute static source or HTTP evidence,
and do not attempt the GPU-world walk without a real GPU browser.

## Release sign-off

A release candidate is QA-green only when every drill is `PASS`; every browser
cell is `PASS` or has a resolved bug and successful rerun; the end-of-day orphan
count is zero; automated commands pass against the same commit; and all test
asset mutations, request blocks, throttles, and storage changes are restored.
