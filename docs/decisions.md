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

## Execution order (agents: sequence yourselves by this)

Rationale: #5 is the engineering critical path, #8 the content critical
path, #23 the calendar critical path — run those first; fan out behind them.

- **Wave 0 (parallel, now):** #5 director · #8 scripts · #4 Lexington
  integration · #2 narrator prep (VO gated on the director's voice pick) ·
  #23 historian *outreach* · #9 deploy (pulled forward — later waves run on
  production-like infra).
- **Wave 1 (closes M1):** #7 volley cutscene → M1 gate: Lexington
  end-to-end (director async-veto review).
- **Wave 2 (closes M2):** #3 signing ∥ #6 Delaware beats+fallback ∥ #10
  sand-table prototype; then #12 Trenton. Generate #18 theme candidates
  during this wave (director picks by ear).
- **Wave 3 (M3 fan-out, one agent per scene):** #14 Valley Forge (easiest,
  world exists) · #13 Tea Party (highest novelty — start early) · #16
  Yorktown (biggest) · #15 Saratoga (needs #10) · #17 Treaty **last**
  (needs #3's aged-signature helper; the finale deserves the mature
  toolkit).
- **Wave 4 (overlaps Wave 3 tail):** #21 shell UI (may start with Wave 3) ·
  #18 final mix · #20 performance (needs several chapters) · #19
  accessibility (needs #6 + #3).
- **Wave 5 (mostly serial):** #22 QA drills → #24 playtests + pacing cuts →
  #23 historian review completes (post-playtest scripts) → #25 trailer →
  launch.

Director pause points: narrator voice pick, main theme pick. Everything
else proceeds per the approval surface above.

## Open

- **Historian engagement (#23):** external review remains the plan of
  record for launch; the director is deciding how to source it (see issue
  discussion). Script-writing does not wait on this.
