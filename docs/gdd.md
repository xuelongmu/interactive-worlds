# American Revolution — Game Design Document

**An interactive documentary, 1773–1783.**
The viewer walks frozen moments, rides living ones, and signs their name to
history. Ten chapters, roughly 65 minutes, in a web browser.

Companion docs: [architecture.md](architecture.md) (technical),
[narration-scripts.md](narration-scripts.md) (script format + three finished
scenes), [decisions.md](decisions.md) (binding director decisions — agents
follow these without re-asking). This document is the creative and
production source of truth.

---

## 1. Vision

**Logline.** You are not told what the Revolution was. You are placed inside
ten of its moments — a wharf at midnight, a green at dawn, a desk with a quill
on it — and the moments are allowed to speak.

**What it is not.** Not a game with win states, not a lecture with pictures,
not historical fiction. Interaction is used only where it deepens presence;
history is never altered by the player; the narration never performs emotion
the scene should carry.

### Design pillars

1. **Presence over gameplay.** Every mechanic exists to make "being there"
   more true. If a mechanic would make the moment about the player's skill,
   cut it.
2. **The register grammar.** Three modes of presence, chosen per scene by
   emotional register, never by novelty:
   **splats for reverence, world models for chaos, the engine for consequence.**
3. **Interactivity tracks historical agency.** A tea-party raider had agency —
   the player gets the axe. A private at Valley Forge had none — the player
   gets a slow walk and no objectives. Helplessness is a design tool.
4. **The earnest voice.** One unnamed documentary narrator. No first person,
   no direct address, no meta-commentary, nothing the record doesn't support.
   Facts, plainly stated, allowed to land.
5. **The ink thread.** The player signs their real name in 1776 — as a 57th
   signer, lower-right among the 56 genuine signatures; refusal is allowed
   and unremarked — and finds it
   again, aged, under glass in 1783. Paper and ink are the connective motif
   of the whole piece.
6. **Degrade, never break.** Every live system (world-model sessions) has a
   pre-rendered fallback. A viewer with a bad connection sees a film, not an
   error.

### Audience & platform

Desktop web (Chromium first; Safari/Firefox verified), mouse + keyboard,
headphones strongly encouraged. One sitting (~65 min) or chapter-by-chapter —
progress persists locally. Secondary contexts: classrooms, museums (kiosk
mode is a post-launch consideration, not in scope).

---

## 2. Experience structure

Register key: **W** = Witness (walkable splat) · **P** = Participant (live
world model) · **A** = Actor (three.js interaction).

| # | Chapter | Date | Register | ~Min | The moment |
|---|---|---|---|---|---|
| 0 | Prologue: Boston | 1773 | W | 3 | A print shop, a street; learn to walk; zero stakes |
| 1 | The Tea Party | Dec 1773 | W→P | 6 | The frozen wharf wakes; the player heaves a chest over the rail |
| 2 | Lexington | Apr 1775 | W (+cutscene) | 7 | Frozen at the instant before the first shot; the volley; the aftermath |
| 3 | The Declaration | Jul–Aug 1776 | W→A | 6 | The Assembly Room; the player signs their own name |
| 4 | The Delaware | Dec 25, 1776 | P | 8 | Poling a Durham boat through ice, at night, in a storm |
| 5 | Trenton | Dec 26, 1776 | P | 3 | The payoff: a running assault, over in minutes |
| 6 | Saratoga | Sep–Oct 1777 | A (+P burst) | 8 | The sand table: why it mattered; then riding Arnold's charge |
| 7 | Valley Forge | Winter 1777–78 | W | 5 | The still point. Slow walk, no objectives, snow |
| 8 | Yorktown | Oct 1781 | A→P→W | 12 | Siege geometry; the night assault on Redoubt 10; the surrender field |
| 9 | Treaty of Paris | 1783 | W→A | 6 | The half-unfinished painting; the player's signature, aged, under glass |

**Pacing rule:** registers alternate; the most kinetic chapter (Saratoga) is
followed by the least interactive (Valley Forge). The finale (Yorktown)
reprises all three registers because by then the viewer reads the grammar
fluently. Chapter title cards with narration over black are the loading
screens — honest waits, never spinners.

### Scene design notes (beyond the three scripted scenes)

- **Tea Party** — the signature technical moment: the frozen splat's final
  camera frame becomes the world model's conditioning image, so the world
  *wakes up in place*. Interaction: break a chest (click-hold), heave it
  over (drag). Whisper-quiet sound design; the splash is the loudest thing
  in the chapter.
- **Trenton** — deliberately short. It exists as the *release* of the
  Delaware's endurance, not as a battle set piece. Hessian drums, snow
  glare, done.
- **Saratoga** — the comprehension chapter. Sand-table first ("here is why
  Burgoyne is starving"), then one 60-second world-model burst inside the
  charge. God-view then mud-view of the same event.
- **Valley Forge** — locomotion capped at 0.9 m/s. No zones except exit.
  The one grace note: von Steuben's drill cadence audible across the snow,
  the sound of an army learning to be an army.
- **Yorktown** — movement 1: the player helps site the second parallel on
  the siege table (siege warfare is geometry — the table makes it thrilling).
  Movement 2: Redoubt 10 at night, bayonets only, muskets unloaded — the
  world model at its most claustrophobic. Movement 3: the surrender field,
  frozen; "The World Turned Upside Down" thin and distant; walk the mile of
  grounded muskets.
- **Treaty of Paris** — Benjamin West's painting is famously half-blank (the
  British commissioners refused to sit). Build the room that way: it
  dissolves into unrendered void where they should be, and the narrator
  names what else was left unfinished — for the enslaved, for the Native
  nations, for the loyalists. Then the desk: the treaty, and beside it the
  Declaration, ten years older, the player's signature browned and feathered.
  Pull back; glass; museum light; end.

---

## 3. The three registers (mechanics)

**Embodiment follows register** (decisions.md): Participant and Actor scenes
are embodied — hands visible in frames, prompts, and interactions; Witness
scenes are a bodiless ghost — never hands, never shadow.

### Witness — walkable splats
- Marble 1.1 Plus worlds rendered by Spark inside three.js; collider mesh
  drives ground raycasts; `metric_scale_factor` → true meters;
  ground auto-aligned to y=0; per-scene `entry.yaw` (worlds face their
  capture origin — always verify by snapshot).
- Locomotion: pointer-lock look, WASD at 1.1–1.4 m/s (scene-tuned), no jump,
  no run. Soft world bounds: beyond the authored perimeter the image thins
  and the ambience fades — turning back is diegetic, never a wall message.
- Box trigger zones fire cues (enter/dwell). Zones are authored in-app with
  the debug overlay (KeyZ) against the real world, then written to the
  manifest.

### Participant — live world model
- Lingbot World 2 via Reactor; conditioning image is either a pipeline frame
  (scene start) or the previous register's final rendered frame (handoffs).
- Input: WASD/arrows mapped to model movement/look; commands serialized;
  form fields exempt.
- **Scripted beats:** manifest `modelEvents` timeline (seconds → prompt
  hot-swap + `model-event` cue). This is how a generative scene stays a
  *scene*: the storm arrives on schedule no matter where the player steers.
- Budgets: first frame ≤ 15 s or the fallback mp4 plays (same cue timeline
  driven by video time). Session hard cap per chapter ~10 min; disconnect on
  scene exit, always.

### Actor — engine interactions
- Precise three.js scenes with Tripo props. Two patterns:
  **hands** (the signing: stroke capture on the parchment, ink that darkens
  as it dries; strokes persisted as vectors) and
  **maps** (sand tables: pick-and-place units, phase playback, constrained
  orbit camera).
- Actor scenes emit `action` events into the same cue engine as zones — the
  narration doesn't know which register it lives in.

---

## 4. Narration, audio, and the cue system

- **Cue-driven everything.** The script markdown is the source of truth;
  cue IDs name their VO files; subtitles come from cue text; the cue engine
  is renderer-agnostic. See narration-scripts.md for format and the three
  finished scenes.
- **Voice.** One narrator (warm, measured, restrained — states facts and
  lets them land). Diegetic voices (mariners, officers) are separate casts,
  spatialized in-scene, and carry all instructions ("Pole off the bow!") —
  the narrator never instructs.
- **Buses:** narration / diegetic / ambience / music, narration ducks others
  −6 dB. Diegetic queues behind narration, never interrupts mid-line.
- **Silence is a cue.** The volley is sound-only, unscored. Valley Forge's
  bed is wind and almost nothing. The signing holds silence while the ink
  dries. Restraint is the sound identity.
- **Music.** Sparse, period-instrument palette (fife, drum, strings), used
  at chapter cards and three or four earned swells; never under narration,
  never in battle. "The World Turned Upside Down" at the surrender is the
  only source-music moment.

---

## 5. Art direction

- **The starting frames are the art bible.** Every world and conditioning
  image is generated (GPT Image 2) with a shared style suffix —
  photorealistic, historically accurate, cinematic natural light, film
  still, no modern objects. New scenes must match the four canonical frames
  in `public/reference/` before generation.
- **Curation workflow:** frame → Marble 1.1 Plus → inspect in viewer →
  re-roll or accept → pin world id in `worlds.config.mjs`. A world is
  accepted only after a walk-through at eye height (fidelity, extent,
  collider sanity, entry view).
- **UI:** parchment-and-ink minimalism. Serif type (current shell palette),
  no HUD in scenes except subtitles and a fade-in interaction hint when the
  player stalls. Chapter cards: engraving-style title over black.

---

## 6. Historical integrity & intensity

**Violence ceiling** (decisions.md): consequences shown; violence itself
elided or at distance; aftermath still and never lingered on; no gore
close-ups; the camera never enjoys it. Applies to every prompt, frame, and
cutscene edit.

- **The record rule:** narration states only what sources support; where the
  record is genuinely unsettled (who fired first), the ambiguity *is* the
  content. No invented quotes — famous-but-unverifiable lines were cut in
  script revision, not hedged.
- The Treaty epilogue names who the settlement failed — the enslaved, the
  Native nations, the loyalists — as fact, not editorial.
- Before launch: a historian review pass of all ten scripts, and a
  sensitivity review of the Treaty epilogue framing.

---

## 7. Accessibility

- Subtitles always available (they're the cue text; free), size option.
- No forced camera shake; world-model look speed capped; a "reduced motion"
  setting swaps Participant scenes to their fallback films.
- Volley and battle sequences: no strobe-rate flashes (photosensitivity
  check in QA).
- Keyboard-only completable end to end (signing accepts keyboard-drawn or
  typed-name fallback rendered in a period hand).
- Pause anywhere; chapter select; resume from any completed chapter.

---

## 8. Production model

**A scene ships when:** script written in cue format → VO + SFX generated →
frame → world generated, walked, pinned → zones/beats authored → manifest
complete → plays end-to-end with fallbacks → historian sign-off.

Content is data: scenes are manifests + assets; engineering ends at the
director/renderers/pipeline. After M2 (below), shipping a chapter should
require no new engine code.

**Cost posture:** all assets baked once (frames cents, worlds ~minutes of
Marble credits, VO regenerated per-cue on hash change). The only per-viewer
cost is world-model session minutes — bounded per chapter, with fallbacks.
Spend and approval governance: see decisions.md (no artificial spend
ceilings; a small director approval surface; everything else autonomous).

## 9. Roadmap

Tracked as GitHub milestones; every issue carries acceptance criteria.

- **M1 — Vertical slice: Lexington end-to-end.** Narrator cast + VO, real
  world integrated with authored zones, volley cutscene, director flow from
  title card to scene hand-off. *Proves the grammar with one chapter.*
- **M2 — Act One: Declaration + Delaware.** The signing (ink thread begins),
  the crossing with timed beats + fallback, Trenton stinger. *Proves all
  three registers and the handoff trick.* Act One must reach
  shippable quality as an internal gate, but release is a **single launch
  with all ten chapters** (decisions.md).
- **M3 — Full script & worlds.** All ten scripts in cue format; all worlds
  generated, walked, pinned; Saratoga and Yorktown sand tables; Tea Party
  wake-up; Valley Forge; Treaty finale with the aged signature.
- **M4 — Polish.** Music, final mix, accessibility pass, performance/
  streaming budgets, title/chapter-select/resume UI.
- **M5 — Launch.** Production deploy, QA + fallback drills, historian
  review, playtests and pacing cuts, trailer from pipeline renders.
