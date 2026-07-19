# Sound-design artifact handoff

The pull request carries code and metadata only. The MP3 bytes are ignored
media and must be delivered from the external roots recorded in
`revolution/pipeline/sfx-artifacts.json`.

## Delivery roots

- Immutable 14-file baseline source:
  `C:/Dev/interactive-worlds/revolution/public/assets/audio`
- Seven issue #43 delta source:
  `C:/Users/xuelong/.ao/data/worktrees/interactive-worlds/interactive-worlds-19/revolution/.artifacts/issue-43/audio`
- Canonical destination, preserving each `amb/...` or `sfx/...` relative path:
  `revolution/public/assets/audio`

Before copying, compare SHA-256 against the manifest. Never overwrite a
canonical file with a different hash without a newly authorized sound cue and
targeted generation record. The 14 baseline files and their trusted cache
records are immutable. The seven delta cache records live in the ignored local
`revolution/pipeline/.sfx-cache.json`; generation was repeated once in the same
targeted mode and reported all seven as cached with zero paid requests.

## Audit evidence

- All 21 files probe as MP3, 44.1 kHz, stereo, with exact requested durations.
- The manifest records bytes, SHA-256, integrated loudness, loudness range, and
  true peak from `ffprobe` and FFmpeg `loudnorm` analysis.
- Playback gain in `sfx.plan.json` accounts for hot source peaks; source bytes
  remain unmodified so hashes and provenance stay exact.
- Spectrogram review of the seven deltas found the expected broadband/impulse
  structures and no obvious sustained score-like tonal bed. This is not a
  substitute for listening: voice, score, and Redoubt-10 gunshot leakage remain
  explicit checkboxes in `pipeline/sfx-audition.html` and are not marked
  approved until a listener records that judgment.

Serve the `revolution/` directory over HTTP and open
`pipeline/sfx-audition.html`. The page groups cues by scene, plays baseline and
delta files from their separate roots, stores approve/reject notes locally,
and exports a JSON review record.

## Cross-lane contracts

- Issue #37 supplies `DirectorOptions.onEngineEvent(event, sceneId)` and emits
  normalized events to the cue engine before the sound observer. This PR's
  adapter consumes that boundary without changing `src/engine/**`.
- Issue #45 exclusively owns scene/narration timing. It received the Tea Party
  completion, Lexington isolated-shot/post-volley silence, Delaware escalation,
  and Yorktown transition requirements keyed by stable sound cue ID.
- Issue #3 owns Declaration gameplay/signature files. `DEC-SIL-001` is the
  precise separate mapping handoff: stop the manifest-owned Assembly Room bed
  on `action:sign-complete`, hold eight seconds, and resume at DEC-061.
- Issue #7 receives `LEX-SFX-001` and locked `LEX-SFX-002` by exact manifest
  path/hash; it does not own scene timing fields.

