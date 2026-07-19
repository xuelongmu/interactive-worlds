# Casting round two — director audition packet

## Director selection

The director's final choices are recorded in `selection.json` and in
[issue comment 5017168767](https://github.com/xuelongmu/interactive-worlds/issues/27#issuecomment-5017168767):

- DRILLMASTER: A — Commander Blake, reused byte-for-byte as
  `/assets/audio/vo/VAL-DRILLMASTER.mp3`.
- OFFICER: C — Callum, reused byte-for-byte as
  `/assets/audio/vo/YOR-041.officer.mp3`.

The neutral audition manifest and review page below remain the immutable record
of the pre-selection packet. No take was regenerated or processed for runtime;
`selection.json` records the exact source/runtime filenames, voice ids, request
settings, durations, byte counts, SHA-256 hashes, provenance, and integration
notes.

Packet status at generation time: **six exact takes generated; no voice
selected and no approval claimed**. The DRILLMASTER and OFFICER lines below
were proposed additions in the director's async-veto window. This packet did not edit
`docs/narration-scripts.md`, add either role to the runtime `CAST`, or wire
audio into Valley Forge or Yorktown.

## Safe audition access

- Review page: `artifacts/casting-round-two/review.html`
- Exact local takes: `artifacts/casting-round-two/takes/`
- Machine-readable provenance: `artifacts/casting-round-two/manifest.json`
- Portable bundle outside the repository and Vite build tree:
  `C:\Users\xuelong\.ao\data\review-artifacts\interactive-worlds\issue-27\american-revolution-casting-round-two-2026-07-19.zip`
- Bundle SHA-256:
  `e38382d20a78511f5cdebb17d4316b38919ce0a1b12fad3a3a36a1ce3b3b9e24`
- Bundle size: 809,916 bytes. It contains the review HTML, both JSON
  manifests, and the six exact MP3 takes.

Open `review.html` from the extracted bundle so its relative `takes/` audio
paths resolve. Do not copy an unapproved take into `public/` or runtime assets.

The generated HTML has structural test coverage for its six playable audio
controls, exact IDs/hashes, neutral decision language, and narrow-screen
layout. The in-app browser surface was unavailable during this run, so visual
browser QA remains pending and is not claimed here.

## Exact proposed lines and request settings

All candidates within a role use the same text, tag, model, and settings. The
lines are dramatized commands, not historical quotations.

### DRILLMASTER — Valley Forge

- Model/output: `eleven_v3`, `mp3_44100_128`
- Audio tag before every bark: `[shouting]`
- Voice settings:
  `{"stability":0.5,"similarity_boost":0.75,"style":0.6}`
- Proposed repeatable bark pool:
  - `En avant — marche!`
  - `Halte! Alignez-vous!`
  - `Rechts um!`
  - `Schultert das Gewehr!`
  - `Quick! Make ready — again!`

These auditions test vocal performance dry. The eventual scene treatment —
positional rolloff across the parade ground, partial masking by wind, and
random bark timing — must be authored only after a director pick.

The configured API key can synthesize saved voices but cannot add new Voice
Library entries. Commander Blake is the only saved slate voice recorded in
German. Jerry B. and Rob are deliberately disclosed contrast checks, not
metadata-equivalent substitutes; either may be rejected solely because its
American or British vocal base fails the required German identity. If all
three are rejected, grant `add_voice_from_voice_library` or add the preferred
German library voices in ElevenLabs before a replacement round.

| Option | Exact ElevenLabs voice ID | Duration | Bytes | SHA-256 |
|---|---|---:|---:|---|
| A — Commander Blake | `Z2yQ1EdlDmcIgh9Pn4Lw` | 11.440 s | 183,946 | `5cf7e3a52228bf001bef8896f00c255dd2018e86f4ca3edef866363c9668b2f3` |
| B — Jerry B. | `TxWZERZ5Hc6h9dGxVmXa` | 10.640 s | 171,407 | `1f2909b161d6a32cb59e6fec18489e11082f2275a0423c0fd78f530b01a91dd2` |
| C — Rob | `2ajXGJNYBR0iNHpS4VZb` | 11.440 s | 183,946 | `b7b9abc3d3f649fbc6a8a9cabb3f6016ea1fb985c802064836eeadf5ee9ad2b9` |

### OFFICER — Yorktown, Redoubt 10

- Model/output: `eleven_v3`, `mp3_44100_128`
- Audio tag before every command: `[whispers]`
- Voice settings:
  `{"stability":0.5,"similarity_boost":0.75,"style":0.35}`
- Proposed movement-two commands:
  - `No shot. Bayonets only.`
  - `Keep low. Follow close.`

| Option | Exact ElevenLabs voice ID | Duration | Bytes | SHA-256 |
|---|---|---:|---:|---|
| A — Low-Voice Confidant | `NXXGR7oSvbRnOixOGba6` | 5.680 s | 91,995 | `d2e054b8bb9ea7d8e1d4a4f87f03d97474d0fb4d4295a9cc7e57f0cf6839f28a` |
| B — Brian | `nPczCjzI2devNBz1zQrb` | 4.960 s | 80,292 | `0290b508e754f64295e7b0d449eca7f0ad4792597050cd4039d20eb0e3c29627` |
| C — Callum | `N2lVS1w4EtoT3dr4eOWO` | 5.840 s | 94,502 | `e6a0f1cc87955a590f59e2ad347a4bd6fa6a3cb0f02f589b418cea00a7d67261` |

## Generation and verification

From `revolution/`:

```powershell
node --test pipeline/casting-round-two.test.mjs
node pipeline/casting-round-two.mjs --dry-run
node pipeline/casting-round-two.mjs --audit
npm run typecheck
npm run build
```

Generation requires the explicit paid mode and can be scoped to one option:

```powershell
node pipeline/casting-round-two.mjs --generate --candidate officer-a-confidant
```

The CLI rejects missing, mistyped, and unknown options before reading the key
or making a request. Its content-addressed local cache verifies the complete
request, exact bytes, duration, and SHA-256. Missing or changed takes generate
new audio; they must never inherit the hashes in this packet.

This packet used exactly six successful TTS requests, one per candidate. Two
earlier preflight attempts stopped before synthesis when the account reported
the missing Voice Library permission; they produced no audio and made no TTS
request. All six final MP3s decode successfully with FFmpeg, and the audit
verifies their current spec signatures and SHA-256 values.

## Director decision requested

Listen to A–C within each role and select one, request a revised slate or line,
or reject all. No candidate is recommended or selected by this packet. Runtime
CAST and scene wiring begin only after the director's decision and any line
veto is resolved.
