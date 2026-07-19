# Main-theme candidates — director audition packet

Status: **four generated candidates, no selection made**. These artifacts are
for the director's by-ear decision on issue #18. Nothing in this packet grants
approval to adapt a motif into chapter-card stings, earned swells, scene
manifests, or the final mix.

## Shared guardrails

- Original instrumental title cues, generated with Eleven Music `music_v2`.
- 36-second brief; explicit palette limited to one-key wooden fife,
  rope-tension field drum, and a small gut-string ensemble.
- Prompts exclude vocals, brass, modern/electronic instruments, cinematic
  percussion, battle intensity, victory fanfare, source music, and quotations.
- Any future use remains subject to the placement rules: never under
  narration, never in battle, and the Lexington volley remains unscored.
- The generated audio is intentionally ignored by Git. Paths below are
  relative to `revolution/` and are reproducible through `pipeline/music.mjs`.

## Candidates

### A — Fife Lament

- Artifact: `public/assets/audio/music/candidates/a-fife-lament.mp3`
- SHA-256: `e439fae2644a0be559eb1a4b03b8dc21e193ba5cf536b8245bb73c10e22814c9`
- Spec signature: `8e5b38bfb0fa142e1b2331c1cff0d1e9a216f836`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: fife states the five-note motif alone; muted strings answer in
  minor-mode suspensions; drum is reserved for two soft cadence figures.
- Tradeoff to assess by ear: the clearest period signal and most exposed motif,
  but it may feel austere or inherit too much familiar martial color.

### B — Ink and String

- Artifact: `public/assets/audio/music/candidates/b-ink-and-string.mp3`
- SHA-256: `a9e526b4bc6745366ce25d767825caa5e5521edc3a2f98c628ee216776fdbc15`
- Spec signature: `ae4606a6bec9aa5a0102fffd45e1331ee84abb92`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: viola and cello introduce the motif like measured pen strokes;
  violins widen it; fife enters late; drum remains a quiet pulse.
- Tradeoff to assess by ear: the most intimate and reflective direction, but
  its Revolution-specific color arrives later and its opening may feel less
  decisive at title scale.

### C — Field Processional

- Artifact: `public/assets/audio/music/candidates/c-field-processional.mp3`
- SHA-256: `a097b074740fcf6f259562bb8485c9fbe3f00bcbca6560fe79eb72130d4b741c`
- Spec signature: `f05b25f03abb6d3becca8653b2e7e99837246fdb`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: restrained rope-drum tread establishes motion; fife and strings
  exchange the motif without accelerating or building toward combat.
- Tradeoff to assess by ear: the strongest forward identity and potentially
  the easiest rhythm to vary later, but also the highest risk of sounding
  military or triumphal.

### D — Unfinished Cadence

- Artifact: `public/assets/audio/music/candidates/d-unfinished-cadence.mp3`
- SHA-256: `7d37db9b80e47b7506bc5fb62e9f42a320fcc572b2161be1a35011fc439f632b`
- Spec signature: `7f4f89aa1c33c3c24d8fd30f87054f5c2459e8de`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: open-fifth strings sustain major/minor ambiguity; fife breaks the
  motif into fragments; one drum entrance leads to an unresolved-soft cadence.
- Tradeoff to assess by ear: the most explicit historical ambiguity and
  interpretive space, but the least conventional title shape and potentially
  the least immediately memorable.

## Reproduction and verification

From `revolution/`:

```powershell
node --test pipeline/music.test.mjs
node pipeline/music.mjs --dry-run
node pipeline/music.mjs
```

The generator writes content-hash state to the ignored
`pipeline/.music-candidate-cache.json` and a machine-readable ignored index to
`public/assets/audio/music/candidates/index.json`. It verifies an existing
artifact's SHA-256 before treating it as cached, and persists after every paid
call.

Generation usage for this packet was exactly four successful 36-second calls:
144 seconds (2.4 minutes) of requested music, with no rejected calls and no
credit exhaustion. At the API's published $0.15/minute rate on 2026-07-19,
that corresponds to $0.36 before any account-specific pricing treatment.

## Director decision requested

Listen to A–D and select one candidate, request a revision of one direction,
or reject all four. The pipeline deliberately records no default or winner.
