/** Reversible main-theme audition spec for issue #18.
 *
 * These are title-theme candidates only. A director must choose by ear before
 * any motif is adapted into chapter stings, swells, or scene manifests.
 */

export const MUSIC_MODEL = "music_v2";
export const OUTPUT_FORMAT = "mp3_48000_192";
export const DURATION_MS = 36_000;

export const PERIOD_PALETTE = Object.freeze([
  "one-key wooden fife",
  "rope-tension field drum",
  "small gut-string ensemble (two violins, viola, and cello)",
]);

const SHARED_BRIEF = `
Create an original, instrumental main-title theme for a restrained interactive
documentary about the American Revolution. Duration: 36 seconds. Historically
grounded late-eighteenth-century chamber and field-music character. Use only
this instrumental palette: ${PERIOD_PALETTE.join("; ")}.

Give the piece a clear, reusable five-note motif, audible room space, natural
acoustic dynamics, and a clean final decay. It must stand alone as a title
audition; do not imitate or quote any existing tune, composer, anthem, march,
or source music. Keep the camera's moral restraint in musical form: no battle
intensity, triumphal victory fanfare, spectacle, or sentimental melodrama.

No vocals, spoken words, choir, brass, woodwinds other than fife, piano,
harpsichord, guitar, bass guitar, synthesizers, electronic sounds, modern drum
kit, taiko, cinematic percussion, sound effects, cannon, gunfire, or ambience.
`.trim();

export const CANDIDATES = Object.freeze([
  {
    id: "a-fife-lament",
    label: "Fife Lament",
    direction:
      "Fife states the motif alone; muted strings answer in minor-mode suspensions; the drum appears only as two soft cadence figures.",
    tradeoff:
      "Most immediately period-readable and motif-forward, but the exposed fife may feel austere or lean toward a familiar martial association.",
  },
  {
    id: "b-ink-and-string",
    label: "Ink and String",
    direction:
      "Viola and cello introduce the motif like measured pen strokes; violins widen it; fife enters late; the drum stays a quiet pulse.",
    tradeoff:
      "Most intimate and morally reflective, but the Revolution-specific color arrives later and the title may open less assertively.",
  },
  {
    id: "c-field-processional",
    label: "Field Processional",
    direction:
      "A restrained rope-drum tread establishes forward motion; fife and strings exchange the motif without accelerating or building to combat.",
    tradeoff:
      "Strongest forward identity and easiest rhythmic material to vary later, but it carries the greatest risk of reading as military or triumphal.",
  },
  {
    id: "d-unfinished-cadence",
    label: "Unfinished Cadence",
    direction:
      "Open-fifth strings hold major/minor ambiguity; fife offers a broken version of the motif; a single drum entrance leads to an unresolved-soft cadence.",
    tradeoff:
      "Best expresses historical complexity and leaves interpretive space, but it is the least conventional title statement and may be less immediately memorable.",
  },
]);

export function promptFor(candidate) {
  return `${SHARED_BRIEF}\n\nCandidate direction: ${candidate.direction}`;
}

export function requestFor(candidate) {
  return {
    prompt: promptFor(candidate),
    music_length_ms: DURATION_MS,
    model_id: MUSIC_MODEL,
    force_instrumental: true,
    store_for_inpainting: false,
    sign_with_c2pa: true,
  };
}
