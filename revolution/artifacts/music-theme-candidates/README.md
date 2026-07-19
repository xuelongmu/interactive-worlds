# Main-theme candidates — director audition packet

Status: **B — Ink and String selected by the director on 2026-07-19**. The
selection applies only to the exact take identified below; the other candidates
remain rejected audition artifacts. The score pipeline may adapt B into the
chapter sting and four earned swells while preserving the placement rules.

## Shared guardrails

- Original instrumental title cues, generated with Eleven Music `music_v2`.
- 36-second brief; explicit palette limited to one-key wooden fife,
  rope-tension field drum, and a small gut-string ensemble.
- Prompts exclude vocals, brass, modern/electronic instruments, cinematic
  percussion, battle intensity, victory fanfare, source music, and quotations.
- Any future use remains subject to the placement rules: never under
  narration, never in battle, and the Lexington volley remains unscored.
- The generated audio is intentionally ignored by Git and stored outside
  Vite's `public/` tree. Paths below are relative to `revolution/`.
- Prompt-mode generation is not byte-reproducible. The hashes below identify
  the original audition takes; rerunning generation creates new takes and must
  not be presented as recovery of these files.

## Safe audition access

- Local exact-take directory:
  `artifacts/music-theme-candidates/takes/`
- Portable exact-take bundle (outside the repository and Vite build tree):
  `C:\Users\xuelong\.ao\data\review-artifacts\interactive-worlds\pr-34\american-revolution-main-theme-candidates-2026-07-19.zip`
- Bundle SHA-256:
  `052518dc626dcfeccbe3e1d0a187352341758481fd9e726f080bc0cdb8a73261`
- Bundle size: 3,475,889 bytes; contains the four original MP3s plus the
  integrity-validated `index.json`.

Audition directly from either review location or extract the bundle outside
`public/`. Do not copy unapproved candidates into runtime assets.

## Candidates

### A — Fife Lament

- Artifact: `artifacts/music-theme-candidates/takes/a-fife-lament.mp3`
- SHA-256: `e439fae2644a0be559eb1a4b03b8dc21e193ba5cf536b8245bb73c10e22814c9`
- Spec signature: `8e5b38bfb0fa142e1b2331c1cff0d1e9a216f836`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: fife states the five-note motif alone; muted strings answer in
  minor-mode suspensions; drum is reserved for two soft cadence figures.
- Tradeoff to assess by ear: the clearest period signal and most exposed motif,
  but it may feel austere or inherit too much familiar martial color.

### B — Ink and String

- Artifact: `artifacts/music-theme-candidates/takes/b-ink-and-string.mp3`
- SHA-256: `a9e526b4bc6745366ce25d767825caa5e5521edc3a2f98c628ee216776fdbc15`
- Spec signature: `ae4606a6bec9aa5a0102fffd45e1331ee84abb92`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: viola and cello introduce the motif like measured pen strokes;
  violins widen it; fife enters late; drum remains a quiet pulse.
- Tradeoff to assess by ear: the most intimate and reflective direction, but
  its Revolution-specific color arrives later and its opening may feel less
  decisive at title scale.

### C — Field Processional

- Artifact: `artifacts/music-theme-candidates/takes/c-field-processional.mp3`
- SHA-256: `a097b074740fcf6f259562bb8485c9fbe3f00bcbca6560fe79eb72130d4b741c`
- Spec signature: `f05b25f03abb6d3becca8653b2e7e99837246fdb`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: restrained rope-drum tread establishes motion; fife and strings
  exchange the motif without accelerating or building toward combat.
- Tradeoff to assess by ear: the strongest forward identity and potentially
  the easiest rhythm to vary later, but also the highest risk of sounding
  military or triumphal.

### D — Unfinished Cadence

- Artifact: `artifacts/music-theme-candidates/takes/d-unfinished-cadence.mp3`
- SHA-256: `7d37db9b80e47b7506bc5fb62e9f42a320fcc572b2161be1a35011fc439f632b`
- Spec signature: `7f4f89aa1c33c3c24d8fd30f87054f5c2459e8de`
- Media check: 36.024 seconds, 881,261 bytes, MP3 at approximately 192 kbps
- Direction: open-fifth strings sustain major/minor ambiguity; fife breaks the
  motif into fragments; one drum entrance leads to an unresolved-soft cadence.
- Tradeoff to assess by ear: the most explicit historical ambiguity and
  interpretive space, but the least conventional title shape and potentially
  the least immediately memorable.

## Verification and intentional regeneration

From `revolution/`:

```powershell
node --test pipeline/music.test.mjs
node pipeline/music.mjs --dry-run
node pipeline/music.mjs --audit
```

`--audit` makes no paid calls. It validates every candidate's current spec
signature, cache entry, artifact presence, and SHA-256 before writing the
ignored `artifacts/music-theme-candidates/takes/index.json`. Invalid entries
are marked unavailable and never inherit stale hashes, including after a
partial candidate run.

Generation requires an explicit paid mode and may be scoped to one candidate:

```powershell
node pipeline/music.mjs --generate --candidate a-fife-lament
```

The CLI rejects missing, unknown, or mistyped flags before reading the API key
or making a paid request. `--generate` content-hash caches current local takes
in `pipeline/.music-candidate-cache.json`, but it is not a recovery mechanism:
if an original take is absent or its spec changed, the service creates a new
take. A new take requires a new audition packet, hashes, and portable bundle.

Generation usage for this packet was exactly four successful 36-second calls:
144 seconds (2.4 minutes) of requested music, with no rejected calls and no
credit exhaustion. At the API's published $0.15/minute rate on 2026-07-19,
that corresponds to $0.36 before any account-specific pricing treatment.

## Director decision

**B — Ink and String** won the by-ear audition. Runtime adoption verifies the
exact take against SHA-256
`a9e526b4bc6745366ce25d767825caa5e5521edc3a2f98c628ee216776fdbc15`
before deriving any score asset; a regenerated take is not an equivalent.
