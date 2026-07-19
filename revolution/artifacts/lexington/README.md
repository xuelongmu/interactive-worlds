# Lexington world validation

This folder records the evidence boundary for issue #4's pinned Lexington
Marble world. The static validator mirrors `SplatScene`'s metric scale,
180-degree X flip, collider ground alignment, and eye-height probes without
claiming that collider coordinates identify visible people or landmarks.

Run from `revolution/`:

```sh
node artifacts/lexington/validate-collider.mjs
```

The validator fails if the local metadata does not match the configured world
pin, required semantics values are absent, entry ground cannot be raycast, any
of the five current zone centers lacks collider support, a derived eye-height
camera misses a zone's vertical extent, or a zone has no cue reference.

## Static evidence for the pinned take

- World id: `dc292531-9d06-4f95-851c-0ebc32a3c73b`.
- Metric scale: `3.1343657970428467`; semantics ground offset:
  `1.7585288286209106`.
- Runtime-equivalent collider alignment shifts the world `+1.782812 m`, a
  `0.024283 m` difference from the semantics metadata value.
- The aligned entry ground raycasts to `y=0`; a `1.65 m` eye height derives an
  entry camera at `y=1.65`.
- The collider is one mesh with 644,849 triangles. Its aligned bounds are
  `x=-94.798394..134.384726`, `y=-0.318899..177.309688`, and
  `z=-196.743054..78.837035` meters.
- All five current zone centers have a collider surface below the same probe
  used by runtime movement, their derived eye-height camera positions fall
  inside the boxes' vertical extents, and every zone is referenced by a cue.

These checks validate asset identity and transform/collider plumbing only.
They do **not** validate the current zones against the visible militia, Parker,
British line, gap, or trigger line.

## Required GPU-browser authoring pass

1. From `revolution/`, run `npm run dev -- --host 127.0.0.1` and open
   `http://127.0.0.1:5173/spikes/splat/` in a GPU-capable browser.
2. Confirm the banner names Lexington rather than the placeholder splat. In
   the console, confirm the pinned `.spz` loaded, metric scale is about
   `3.13`, and ground alignment is about `+1.78 m`.
3. Before moving, confirm the HUD reads approximately `(0.0, 1.7, 0.0)` and
   the designed entry yaw shows the intended view. Capture the **entry view**.
4. Press `Z` to expose the collider wireframe and zone boxes. Walk at eye
   height to the visible militia line, Parker, British line, gap, and designed
   trigger line. Record HUD coordinates and box extents from actual geometry;
   do not infer actor locations from the collider alone.
5. Re-author all five boxes in `src/scenes/lexington.json`, reload, and traverse
   them deliberately. Verify `LEX-020`, `LEX-021` after a two-second Parker
   dwell, `LEX-030`, `LEX-040`, and `LEX-060` each fire in sensible places.
6. Capture two distinct **walk views** that show scale, collider/ground sanity,
   and authored placement. Post the entry view plus both walk views in the PR
   for director async-veto review; do not describe them as approved.

## Current acceptance status

On 2026-07-19 the local Vite server loaded, but no in-app browser surface was
attached to this worker. No GPU/browser walk was run, no snapshots were
captured, and the five legacy scaffold zone coordinates were deliberately left
unchanged. The world was not re-rolled (zero re-rolls in this task).
