# Historically convergent branching contract

Issue #46 lets the experience remember how the viewer participated without
making an established event mutable. Branches may change player role,
interaction order, camera attention, or a later control-HUD acknowledgement.
History, narration, outcomes, cue timing, and chapter reconvergence remain
fixed. Every path reuses the same committed media.

Branch instructions and acknowledgements are control-HUD content, never
narration subtitles. The HUD displays the action that is actually bound,
including its availability, such as `E — Sweep the deck`.

## Director-selected v2 cadence

| Branch | Choice and convergence | Later acknowledgement |
|---|---|---|
| **Tea Party deck duty** (`tea-party-deck-duty`) | Choose `break-chest` (`E — Break a chest`) or `sweep-deck` (`E — Sweep the deck`). The selection changes which shared deck task receives attention first. Both tasks retain the same narration, audio, timing, and outcome, and the paths rejoin at the common deck-clear beat. | Lexington receives the non-narrative context “At Griffin's Wharf, you chose the hatchet.” or “… chose the broom.” It does not add or replace a narration cue and exposes no branch action of its own. |
| **Delaware duty** (`delaware-duty`) | Choose `pole` (`E — Pole from the bow`) or `clear-ice` (`E — Clear ice from the hull`). The selection changes the first task and camera attention only. Both paths use the same crossing, encounter the storm, land, and rejoin no later than the existing common landing sequence. | Trenton names the stored duty and orders the first contextual task: `pole` uses `E — Close the column`; `clear-ice` uses `E — Clear the gun path`. Both then use the common `E — Advance` action before the unchanged guns-open beat. |
| **Saratoga analysis lens** (`saratoga-analysis-lens`) | Choose `trace-river-road` (`E — Trace the river road`) or `inspect-supply-line` (`E — Inspect the supply line`). The selection changes table attention and interaction order only. Both paths inspect the same analysis, complete the same phases, and rejoin before the charge. | Valley Forge recalls the lens in non-narrative context. The river-road path says “At Saratoga, you traced the river road.” and offers `E — Listen for the drill cadence`; the supply path says “At Saratoga, you inspected the supply line.” and offers `E — Inspect the supply breakdown`. Both return to the same slow walk and exit. |

A new Trenton perspective choice is explicitly deferred. Trenton remains short
and hosts only the Delaware callback; the v2 schema has no Trenton-perspective
branch id or value. Counterfactual or generative branching is also outside this
contract.

The choices above are descriptive of what the viewer did, never of what
happened historically. The record has no preferred path: every branch begins
at `null`, and replaying its chapter can immutably replace that selection. This
keeps the creative defaults reversible if the director revises them through the
separate review surface.

## Versioned state and deterministic migration

The dedicated storage key remains `revolution-branch-state`. Version 2 has a
canonical, chronological encoded order:

```json
{
  "version": 2,
  "choices": {
    "tea-party-deck-duty": null,
    "delaware-duty": "pole",
    "saratoga-analysis-lens": null
  }
}
```

- A valid version 1 record containing `delaware-duty: "pole"`,
  `delaware-duty: "clear-ice"`, or `null` migrates deterministically to version
  2. Its Delaware value is preserved and both new branches are neutral. The
  next save emits the canonical version 2 form.
- A missing record, malformed JSON, unknown version, missing current field, or
  invalid branch value decodes atomically to the all-neutral state. A valid
  value elsewhere in a corrupt record is not selectively salvaged.
- Ordinary chapter transitions, reload/resume, and chapter selection preserve
  all choices in a new immutable state object.
- Chapter selection does not manufacture choices. Replaying a choice chapter
  presents its two actions again, and a new selection replaces only that
  branch without mutating the prior record.
- Full story restart is the only entry mode that returns all-neutral state.
  The durable reset removes the dedicated storage key as well.

## Presentation handoff

`src/branch-state.ts` is the single source of branch meaning. Consumers call
`getBranchPresentation(state, context, usable)` and pass its output through
without inferring branch context or timing. `usable` defaults to `true`; when it
is `false`, the exact action remains present with `usable: false`. A neutral
callback or `out-of-range` returns `action: null` and `acknowledgement: null`.

| Context | Selection condition | `action` | `acknowledgement` |
|---|---|---|---|
| `tea-party-break-chest-choice` | Any | `E — Break a chest` | `null` |
| `tea-party-sweep-deck-choice` | Any | `E — Sweep the deck` | `null` |
| `lexington-deck-duty-acknowledgement` | `break-chest` / `sweep-deck` | `null` | Griffin's Wharf hatchet / broom text above |
| `delaware-pole-choice` | Any | `E — Pole from the bow` | `null` |
| `delaware-clear-ice-choice` | Any | `E — Clear ice from the hull` | `null` |
| `trenton-duty-callback` | `pole` / `clear-ice` | `E — Close the column` / `E — Clear the gun path` | Crossing duty text above |
| `trenton-common` | Any | `E — Advance` | `null` |
| `saratoga-river-road-choice` | Any | `E — Trace the river road` | `null` |
| `saratoga-supply-line-choice` | Any | `E — Inspect the supply line` | `null` |
| `valley-forge-analysis-acknowledgement` | `trace-river-road` / `inspect-supply-line` | `E — Listen for the drill cadence` / `E — Inspect the supply breakdown` | Saratoga lens text above |
| `out-of-range` or a neutral callback | None | `null` | `null` |

`BranchPresentationState.action` is exactly
`{ binding: "E"; label: BranchActionLabel; usable: boolean } | null`.
`acknowledgement` is a typed non-narrative string or `null`. The legacy
`selectedDuty` field remains temporarily available for Delaware compatibility;
new HUD work consumes only `action` and `acknowledgement`.

The interaction label, disabled state, acknowledgement, focus, and selected
state must remain available to assistive technology. Live and
fallback/reduced-motion paths use the same contract. Existing subtitles,
captioning, narration ducking, ambience, and event audio remain common to both
choices; this contract adds no VO, SFX, or other generated media.

## Ownership boundary

This contract owns only the typed branch record, codec/storage/navigation
semantics, presentation data, documentation, and deterministic focused tests.
It deliberately does not edit the engine, director, HUD/shell, scene manifests,
cue timing, Declaration, media/audio/VO, generators, or shared world and sound
configuration. Runtime owners consume these exported types and defaults rather
than duplicating branch-state logic.
