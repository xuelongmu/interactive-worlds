# Director Decisions Log

Binding creative and governance decisions. Agents working issues follow these
without re-asking; changes here require the director.

## 2026-07-19

**Title.** The piece is titled **American Revolution**. (Repo/folder names
unchanged.)

**Embodiment follows register.** Participant scenes: the viewer is embodied —
hands visible (the pole, the axe, the bayonet grip) in conditioning frames and
prompts. Actor scenes: hands (the quill). Witness scenes: bodiless ghost —
never hands, never shadow. This quietly teaches the viewer which mode they
are in. Applies to every conditioning frame and world-model prompt authored
from now on.

**Violence intensity ceiling.** Consequences shown; violence itself elided or
at distance. Aftermath is still and never lingered on. No gore close-ups. The
camera never enjoys it. Applies to all world-model prompts, cutscene edits,
and generated frames. Classroom use is in the audience statement — when in
doubt, restrain.

**Visual evidence before atmosphere.** Keep the established photorealistic
aesthetic, but generated frames and worlds must be conditioned by authoritative
visual references wherever paintings, maps, restored rooms, or collection
objects exist. A later history painting is explicitly bounded interpretation,
not an eyewitness camera. Every source records what it may support, its date,
and its reuse status; invented architecture or material culture is corrected.

**The signing.** The player signs as a 57th signer, lower-right among the 56
genuine signatures — the trespass is the point. Refusing to sign is allowed
and unremarked; the Treaty finale then shows the historical document only,
with its conditional cue (issue #17 carries both paths).

**Epilogue depth.** The Treaty's "who the settlement failed" section is a
full walkable beat — three dwell cues in the unpainted void (the enslaved,
the Native nations, the loyalists) — factual register, no music. Not a
footnote, not a lecture.

**Music.** Generated candidates under the period-instrument constraint
(fife, drum, strings). The main theme requires director approval by ear
before propagating into chapter stings and swells. All other GDD §4 music
rules stand (never under narration, never in battle, volley unscored).

**Narrator.** Audition in progress (three candidates, three lines:
LEX-010 / DEC-030 / DEL-041). Director picks by ear; until then #2's VO
generation waits on the voice id only — everything else in #2 can proceed.

**Current cast approved.** Keep the complete round-one cast. The BOSUN's
TEA-050 direction changes from a projected deck call to a low, urgent whisper
within the work party; this is performance direction, not a claim that the
public Tea Party action was covert.

**Release shape.** Single launch with all ten chapters. Act One
(Prologue → Trenton) is still built and verified as a complete internal
milestone — it must be shippable-quality, it just doesn't ship separately.

**Language.** English-only at launch. Subtitles are cue text, so
localization stays cheap later.

## Approval surface

- **Director, synchronous (work waits):** narrator voice, main music theme.
  Title — decided above.
- **Director, async veto (agents proceed, post artifacts, reversible):**
  each chapter's script before VO generation (post the cue list in the PR);
  each pinned Marble world (post entry-view + two walk snapshots);
  the volley cutscene edit.
- **Agents, fully autonomous:** everything else, held to the GDD and this
  log.

## Spend posture

No artificial ceilings — agents proceed until an account's credits are
exhausted, then flag and continue with whatever doesn't need that account.
One loop-guard (an anomaly signal, not a budget): if a single scene burns
more than 5 world re-rolls without an acceptable take, stop and flag the
prompt/frame instead of re-rolling further.

## Execution order — revised 2026-07-19 after PR #11 and casting round 1

PR #11 delivered the Wave 0–2 backbone (#5 director, #6 Delaware system,
#8 all nine scripts, #10 sand table). Casting round 1 (#26) covers the
narrator and all three scripted diegetic roles and moves VO to eleven_v3
(note: the model switch invalidates every VO content hash — the first
post-merge run is a full ~69-line regeneration, expected, run it once).

- **Now (parallel):** merge #26 → finish #2 (full v3 VO run, verify
  ducking/subtitle sync in the director flow) · #4 residual (re-author
  Lexington zones against the real world) · #7 volley cutscene · capture
  the Delaware fallback take (#6 residual — one good driven run, saved
  via the spike's record button) · #23 historian outreach · #9 deploy
  (still pulled forward) · #18 theme candidates (director picks by ear).
- **M1 gate:** Lexington end-to-end with real VO — director async-veto
  review. Then #3 signing and #12 Trenton close M2.
- **Wave 3 (M3 fan-out, one agent per scene; frames + worlds for the new
  scenes are being pre-generated now):** #14 Valley Forge · #13 Tea Party
  (highest novelty — start early) · #16 Yorktown · #15 Saratoga · #27
  casting round 2 (DRILLMASTER, whispered OFFICER — script lines first,
  async-veto, then #26-style auditions) · #17 Treaty **last** (needs #3's
  aged-signature helper).
- **Wave 4 (overlaps Wave 3 tail):** #21 shell UI (may start now — the
  director exists) · #18 final mix · #20 performance · #19 accessibility.
- **Wave 5 (mostly serial):** #22 QA drills (includes the GPU-browser
  verification PR #11 deferred) → #24 playtests + pacing cuts → #23
  historian review completes → #25 trailer → launch.

**Casting rule (standing):** any new diegetic role introduced by script
revisions triggers a #26-style round — candidates auditioned on the real
lines with the real audio tags, voice distinct from the existing cast,
direction lives in the CAST map, director picks by ear. Current roster
after #26: NARRATOR, BOSUN, MARINER, SERGEANT; #27 adds DRILLMASTER and
OFFICER when their scenes are built.

Director pause points: narrator/diegetic picks (round 1 in progress),
main theme pick, casting round 2 picks.

## Open

- **Historian engagement (#23):** external review remains the plan of
  record for launch; the director is deciding how to source it (see issue
  discussion). Script-writing does not wait on this.
