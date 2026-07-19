# Light branching: bounded first-pass options

Issue #46 adds responsiveness without making an established event mutable. This
proposal is intentionally limited to existing scene concepts, cue text, audio,
ambience, and declared live/fallback media. No option needs new paid media.
Branch instructions are control-HUD content, never narration subtitles, and the
HUD must display the action that is actually bound (for example,
`E — Clear ice`).

## Historically convergent options

| Option | Choice and convergence | Later acknowledgement | Existing-media and access plan |
|---|---|---|---|
| **1. Delaware duty (selected default)** | At `DEL-020`, choose `pole` (`E — Pole from the bow`) or `clear-ice` (`E — Clear ice from the hull`). The existing mariner line names both jobs. The choice changes the first task and camera attention only; both paths use the same boat, encounter the storm, land, and rejoin no later than `DEL-032`. | At Trenton, the first contextual task is ordered by the stored duty: `pole` starts with `E — Close the column`; `clear-ice` starts with `E — Clear the gun path`. The HUD explicitly prefaces it with “At the crossing, you chose …”. Both then receive the common `E — Advance` action before the existing guns-open beat. | Reuse all existing Delaware/Trenton narration, diegetic VO, subtitles, ambience, live scenes, and fallbacks. Do not add branch narration or audio. In fallback/reduced-motion mode, the same choice and acknowledgement remain keyboard-operable over the video. Focus, selected state, and the acknowledgement are exposed to assistive technology; prompts do not enter the narration subtitle region. |
| **2. Tea Party deck duty** | After control is granted, choose `E — Break a chest` or `E — Sweep the deck`. The first task changes, but each path encounters both existing visual beats and rejoins at `deck-clear`; Parliament's response and Lexington are unchanged. | On entering Lexington, a non-narrative context card states “At Griffin's Wharf, you chose the hatchet” or “… chose the broom” before the common movement prompt. | Reuse the existing BOSUN line, Tea Party narration/subtitles, `wharf-night` ambience, `tea-chest` SFX, and shared live/fallback scene. Captions identify the SFX; the two controls have distinct accessible names and selection state. No new VO or SFX. |
| **3. Trenton perspective** | Before the guns-open beat, choose `E — Stay with the column` or `E — Move toward the guns`. This changes route/perspective only. Both paths witness the existing surrender beat and rejoin before Saratoga. | Saratoga's first sand-table task acknowledges the perspective: the column path places an infantry unit first; the guns path traces the artillery/supply approach first. The same phases and surrender follow. | Reuse Trenton/Saratoga narration and subtitles, their ambience, existing cannon SFX, sand-table assets, and live/fallback media. A reduced-motion path makes the same choice in the control HUD and announces the selected perspective without spatial-only instructions. |
| **4. Saratoga analysis lens** | At the sand table, choose `E — Trace the river road` or `E — Inspect the supply line`. This changes optional context and interaction order; both paths complete the same Freeman's Farm and Bemis Heights phases and rejoin before the charge. | At Valley Forge, the stored lens determines whether the first optional context prompt points to the supply breakdown or the drill cadence. It explicitly says which Saratoga lens is being recalled, then returns to the same slow walk and exit. | Reuse Saratoga/Valley Forge narration and subtitles, `command-tent`/`valley-forge-wind` ambience, the same sand table, and existing fallback behavior. Table targets and the later context prompt need keyboard focus, text alternatives, and non-spatial wording. No new audio. |

## Smallest reversible default

Option 1 is the default because one existing diegetic line already legitimizes
both duties, both branches share all media and scripted historical beats, and
the callback can be an interaction-order change rather than a new factual cue.
The stored choice is descriptive of what the viewer did, never of what happened
historically.

The contract uses branch id `delaware-duty` with values `pole` and `clear-ice`.
The absence of a choice is a supported neutral state. A viewer can replace the
choice whenever the Delaware interaction is offered again, so the default is
reversible until the next selection is stored. The callback must visibly name
the earlier selection; silently changing a prompt is not enough.

## Persistence and navigation semantics

- A valid choice is stored in a versioned, dedicated local record and survives
  ordinary chapter transitions, reload, resume, and chapter selection.
- Full story restart clears branch state. It does not retain a previous duty.
- Chapter selection preserves branch state. Replaying Delaware presents the
  choice again and a new selection replaces the old one.
- Selecting a later chapter with no stored choice uses the neutral common path
  and shows no fabricated acknowledgement.
- Invalid, corrupt, or unknown-version persisted data decodes to the neutral
  state. State transitions are immutable and deterministic.

## Isolated-PR boundary and integration handoffs

This first PR owns only the typed state/codec/storage contract and deterministic
tests outside `src/engine/**`. It deliberately does not edit the director,
engine story state, scene manifests/cues or timing, HUD presentation,
Declaration content, sound mappings/assets, or shared world configuration.

There are four conflict-free follow-up seams:

1. The #44 HUD owner can render the two actual-bound Delaware actions, the
   selected state, the explicit Trenton acknowledgement, and equivalent
   keyboard/screen-reader behavior from the module's typed presentation state;
   the HUD does not infer branch meaning or place it in subtitles.
2. The #45 manifest/timing owner can add branch action identifiers and the two
   convergent interaction orders without changing cue timing or outcomes.
3. The #37 director owner can call the standalone persistence contract on
   selection, restart, resume, transition, and chapter-select entry.
4. After those owners land, a small integration PR can connect the three seams
   and test both live and fallback paths without adding media.
