# Historically convergent branching contract

Issue #46 lets the experience remember how the viewer participated without
making an established event mutable. The four choices may change player role,
interaction order, or camera attention. History, narration, outcomes, cue
timing, and chapter reconvergence remain fixed, and every path reuses committed
media.

Branch objectives, actions, selection confirmations, errors, and later
acknowledgements are control-HUD content, never narration subtitles. `E` and
`F` are simultaneous non-walking action keys; `WASD` remains movement and the
mouse remains look.

## Director-selected v2 cadence

| Moment and objective | Simultaneous actions | Fixed convergence | Later acknowledgement |
|---|---|---|---|
| **Tea Party deck duty** (`tea-party-deck-duty`): “Choose your first deck duty.” | `E — Break a chest` (`break-chest`) · `F — Sweep the deck` (`sweep-deck`) | Only the first task and camera attention change. Both shared deck tasks retain the same narration, audio, and timing, and rejoin at deck-clear before the same Parliament sequence. | Lexington shows “At Griffin's Wharf, you chose the hatchet.” or “… chose the broom.” |
| **Delaware duty** (`delaware-duty`): “Choose your duty for the crossing.” | `E — Pole from the bow` (`pole`) · `F — Clear ice from the hull` (`clear-ice`) | The first task and camera attention change. Both paths encounter the same storm, landing, and historical outcome. | Trenton shows “At the crossing, you chose to pole from the bow.” or “… chose to clear ice from the hull.” alongside the common Trenton choice. |
| **Trenton perspective** (`trenton-perspective`): “Choose where to advance.” | `E — Stay with the column` (`stay-with-column`) · `F — Move toward the guns` (`move-toward-guns`) | Route and camera attention change. Both paths rejoin for the same surrender and historical outcome. | Saratoga shows “At Trenton, you stayed with the column.” or “… moved toward the guns.” alongside the common Saratoga choice. |
| **Saratoga analysis lens** (`saratoga-analysis-lens`): “Choose how to study the campaign.” | `E — Trace the river road` (`trace-river-road`) · `F — Inspect the supply line` (`inspect-supply-line`) | Table attention and interaction order change. Both paths complete the same battle phases and rejoin before the charge. | Valley Forge shows “At Saratoga, you traced the river road.” or “… inspected the supply line.” |

The choices describe what the viewer did, never what happened historically.
Every moment begins neutral. A confirmed choice latches once during that
chapter entry; replaying the chapter creates a fresh latch, so a later confirmed
choice can immutably replace only that moment's persisted value. Generative or
counterfactual branching remains deferred outside this contract.

## Versioned state and deterministic migration

The dedicated storage key remains `revolution-branch-state`. Version 2 has a
canonical chronological encoded order:

```json
{
  "version": 2,
  "choices": {
    "tea-party-deck-duty": "break-chest",
    "delaware-duty": "pole",
    "trenton-perspective": "stay-with-column",
    "saratoga-analysis-lens": "trace-river-road"
  }
}
```

- A valid version 1 record containing `delaware-duty: "pole"`,
  `delaware-duty: "clear-ice"`, or `null` migrates deterministically to version
  2. Its Delaware value is preserved and the other three moments are neutral.
  The next save emits canonical version 2.
- A missing record, malformed JSON, unknown version, missing current field, or
  invalid value decodes atomically to all-neutral state. A corrupt record is
  not selectively salvaged.
- Chapter transition, reload/resume, and chapter select preserve all four
  choices in a new immutable state object. Chapter select does not manufacture
  a selection.
- A replay uses a fresh per-entry latch. Its first matching backend confirmation
  may replace the persisted choice without mutating the prior state object.
- Full story restart is the only navigation mode that returns all-neutral
  state. Durable reset also removes the dedicated storage key.

## Exact presentation contract

`getBranchPresentation(state, context, options)` is the single presentation
source. For a choice context it returns:

- the stable `momentId` and one-line `objective`;
- an exact readonly two-element `actions` tuple ordered `E`, then `F`;
- for each action, stable `id`, `choiceId`, `requestId`, and
  `confirmationEventId`, plus its literal binding, label, and caller-supplied
  `usable` value;
- `selectedChoiceId` from durable state and `latchedChoiceId` from the current
  entry latch; and
- the previous chapter's typed, non-narrative `acknowledgement`, when present.

Readiness belongs to runtime, not branch logic. If `options.usable` is omitted,
both actions remain visible with `usable: false`; the contract never guesses
that a live or fallback scene is ready. Callback-only and `out-of-range`
contexts expose `actions: null` and no objective. A neutral callback never
fabricates an acknowledgement.

| Context | Moment/actions | Possible acknowledgement |
|---|---|---|
| `tea-party-deck-duty-choice` | Tea Party E/F pair | None |
| `lexington-deck-duty-acknowledgement` | None | Tea Party deck duty |
| `delaware-duty-choice` | Delaware E/F pair | None |
| `trenton-perspective-choice` | Trenton E/F pair | Delaware duty |
| `saratoga-analysis-lens-choice` | Saratoga E/F pair | Trenton perspective |
| `valley-forge-analysis-acknowledgement` | None | Saratoga lens |
| `out-of-range` | None | None |

The module retains a compile-only singular-action variant while the separately
owned engine seam still references the earlier type. The v2
`getBranchPresentation` function never returns that variant; new integration
consumes `actions`, `objective`, selection/latch state, and `acknowledgement`.

## Request, confirmation, and error truth

`BRANCH_ACTION_MAPPINGS` declaratively maps every stable action and choice to a
request id and one normalized backend confirmation event id. Key input only
requests an action; it does not select, acknowledge, or persist anything.

Runtime passes normalized backend outcomes to the pure
`applyBranchRuntimeEvent(state, latch, event)` reducer:

- A matching `branch-confirmed` event and request id latches the choice,
  returns immutable updated state, and exposes a typed selection
  acknowledgement. The first confirmation edge wins for that entry.
- Later confirmation events on the same latch return `ignored` and do not
  change state, including an attempt to confirm the other action.
- `command_error` is a separate visible, retryable handoff. It leaves state and
  latch untouched, so a later matching confirmation can still succeed.
- Unknown ids, a request for another moment, or mismatched request and
  confirmation ids are programmer/protocol errors and are rejected.

This is pure mapping and state logic, not engine implementation. It does not
send commands, listen to Reactor, infer readiness, or claim that input was
confirmed.

## Accessibility, media, and ownership boundary

The objective, both action labels and bindings, usable state, selection/latch
state, acknowledgement, and visible command error are typed for the control
HUD and assistive technology. Live and fallback/reduced-motion paths consume
the same contract. Existing subtitles, captions, narration ducking, ambience,
and event audio remain common to both choices; no VO, SFX, or generated media
is added.

This PR owns only the branch-state record, codec/storage/navigation semantics,
pure presentation and confirmation mapping, documentation, and deterministic
focused tests. It does not edit the engine, director, HUD/shell, scene
manifests, cue timing, Declaration, media/audio/VO, generators, or shared world
and sound configuration. Runtime owners consume these exported types and data
instead of duplicating branch logic.
