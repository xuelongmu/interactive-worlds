# Semantic touch input core

Issue #82 is split at the presentation seam. This first implementation supplies
renderer-neutral semantic input and renderer integration. It deliberately does
not mount touch chrome, change control hints, or claim mobile-browser support.
Those presentation and real-device acceptance steps remain follow-up work after
the instruction-HUD changes.

## API

`revolution/src/engine/semantic-input.ts` exports:

- `SemanticInputController`: a renderer-owned port for normalized movement,
  look deltas/rates, contextual action press/release, modality, capability, and
  lifecycle reset.
- `bindSemanticTouchControls(options)`: a Pointer Events adapter for separate
  movement, look, and contextual-action surfaces. It owns pointers by ID,
  supports concurrent thumbs, and returns a disposer.
- semantic intent and adapter types for HUD and standalone review routes.

`SplatScene.semanticInput` and `WorldModelScenePlayer.semanticInput` expose the
active port. Both renderer option types also provide `onSemanticInputReady`, so
a director/HUD integration does not need to reach into renderer internals. The
callback receives `null` when the renderer hands off, falls back, or disposes.
`input.supportsNavigation` is false for non-navigable Reactor models; an adapter
must not mount movement/look controls in that state.

Example mounting code for the later HUD:

```ts
const unbindTouch = bindSemanticTouchControls({
  controller: input,
  movementSurface: leftPad,
  lookSurface: rightDragSurface,
  actions: presentationActions.map((action) => ({
    surface: buttonByChoiceId.get(action.choiceId)!,
    actionId: action.choiceId,
    isReady: () => action.usable,
  })),
});
```

The HUD owns its elements and styling. It must apply `touch-action: none` only
to the immersive control surfaces it passes to the adapter. Shell, settings,
and other scrollable UI must retain normal browser gestures.

## Semantics and lifecycle

- Movement axes are normalized: forward/right are positive. Diagonal input is
  preserved and capped to unit magnitude.
- Look deltas are radians: right/up are positive. The touch adapter applies a
  pixel threshold, sensitivity, and per-event clamp before emitting them.
- Contextual action IDs are opaque. Reactor accepts either the existing `E`/`F`
  bindings or the corresponding branch `choiceId`, then uses the same readiness,
  `BranchActionRequest`, held-prompt, and release-prompt path.
- A keyboard/mouse or touch event changes the last-used modality. Switching
  modality releases all retained state before accepting the new command.
- Pointer release, cancellation, lost capture, blur, visibility loss, control
  lock, pause, rollover, fallback, disconnect, handoff, and disposal all clear
  retained movement/look/action. A lifecycle clear also invalidates captured
  pointer IDs, so held thumbs cannot silently resume after re-enable.
- No global `KeyboardEvent` is created or dispatched. Desktop listeners and the
  touch adapter feed the same semantic port.

## Remaining issue #82 work

The later presentation PR must mount accessible/safe-area-aware controls and
hints, connect them through the director handoff/contextual-choice snapshots,
and reuse the adapter in both standalone review routes. Safari on iOS/iPadOS and
Chrome on Android evidence (portrait/landscape, backgrounding, two-thumb input,
zone traversal, live Reactor action, and cinematic/fallback suppression) has not
been collected by this core PR and must not be marked complete from unit tests.
