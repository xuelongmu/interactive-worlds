/** Reversible casting-round-two audition spec for issue #27.
 *
 * The lines are proposed script additions awaiting the director's async-veto
 * window. This module does not add them to narration-scripts.md, select a
 * voice, update CAST, or wire either scene.
 */

export const MODEL_ID = "eleven_v3";
export const OUTPUT_FORMAT = "mp3_44100_128";
export const ISSUE_URL = "https://github.com/xuelongmu/interactive-worlds/issues/27";

export const ROLES = Object.freeze([
  {
    id: "drillmaster",
    speaker: "DRILLMASTER",
    scene: "Valley Forge",
    lineStatus: "proposed-awaiting-director-async-veto",
    tag: "[shouting]",
    settings: Object.freeze({ stability: 0.5, similarity_boost: 0.75, style: 0.6 }),
    lines: Object.freeze([
      "En avant — marche!",
      "Halte! Alignez-vous!",
      "Rechts um!",
      "Schultert das Gewehr!",
      "Quick! Make ready — again!",
    ]),
    context:
      "A five-bark pool heard across the parade ground: projected cadence in French, German, and deliberately broken English. These are dramatized commands, not attributed quotations.",
    reviewCriterion:
      "Choose by projection, clipped cadence, intelligibility through wind, and a German vocal identity that remains credible after positional rolloff; reject modern action-game swagger.",
  },
  {
    id: "officer",
    speaker: "OFFICER",
    scene: "Yorktown — Redoubt 10",
    lineStatus: "proposed-awaiting-director-async-veto",
    tag: "[whispers]",
    settings: Object.freeze({ stability: 0.5, similarity_boost: 0.75, style: 0.35 }),
    lines: Object.freeze([
      "No shot. Bayonets only.",
      "Keep low. Follow close.",
    ]),
    context:
      "Two movement-two instructions immediately before the Redoubt 10 advance. These are dramatized commands, not attributed quotations.",
    reviewCriterion:
      "Choose by audible breath, urgency held below speaking volume, terse command authority, and clarity at close range; reject narration, seduction, or horror color.",
  },
]);

export const CANDIDATES = Object.freeze([
  {
    id: "drillmaster-a-blake",
    roleId: "drillmaster",
    label: "A — Commander Blake",
    voiceId: "Z2yQ1EdlDmcIgh9Pn4Lw",
    sourceName: "Commander Blake (loudest on ElevenLabs)",
    publicOwnerId: "41dafcb0d65c418a35d4c2aa95c2df5161057995ab4cf7c3294dc5a2dcbaf14a",
    libraryMetadata: "German; male; middle-aged; raspy; professional character voice",
    tradeoff:
      "The only slate voice recorded in German, and its weathered rasp may survive the wind bed naturally, but its battle-tested color may overstate violence in a scene about learning and endurance.",
  },
  {
    id: "drillmaster-b-jerry",
    roleId: "drillmaster",
    label: "B — Jerry B.",
    voiceId: "TxWZERZ5Hc6h9dGxVmXa",
    sourceName: "Jerry B. - Military Commander | Gruff, Gritty Authority",
    publicOwnerId: "a39978ae1a3df0f45fdab1322b8c5a8723fa4e2909858fd3c6bb5ab836cc50de",
    libraryMetadata: "American; male; middle-aged; intense; professional character voice",
    tradeoff:
      "A hard test of whether v3 can carry the multilingual lines with drill clarity, but the American vocal base and modern military profile may disqualify it by ear.",
  },
  {
    id: "drillmaster-c-rob",
    roleId: "drillmaster",
    label: "C — Rob",
    voiceId: "2ajXGJNYBR0iNHpS4VZb",
    sourceName: "Rob - Tough, Calloused, British",
    publicOwnerId: "465295810ef94f8627fad34ba88551a02745957d1c3b09877a3fc3de528d6f2f",
    libraryMetadata: "British; male; middle-aged; rough; professional character voice",
    tradeoff:
      "Calloused texture offers a less game-like command comparison, but the British vocal base must not be mistaken for the required German identity.",
  },
  {
    id: "officer-a-confidant",
    roleId: "officer",
    label: "A — Low-Voice Confidant",
    voiceId: "NXXGR7oSvbRnOixOGba6",
    sourceName: "Low-Voice Confidant",
    publicOwnerId: null,
    libraryMetadata: "English; male-presenting; late thirties; quiet, intimate, breath-present generated voice",
    tradeoff:
      "The most naturally breath-present and close option, but its gentle personal cadence may resist terse military authority.",
  },
  {
    id: "officer-b-brian",
    roleId: "officer",
    label: "B — Brian",
    voiceId: "nPczCjzI2devNBz1zQrb",
    sourceName: "Brian - Deep, Resonant and Comforting",
    publicOwnerId: null,
    libraryMetadata: "American; male; middle-aged; resonant; premade voice",
    tradeoff:
      "Mature resonance could retain clarity at whisper volume, but the comforting base may turn the instruction into calm narration.",
  },
  {
    id: "officer-c-callum",
    roleId: "officer",
    label: "C — Callum",
    voiceId: "N2lVS1w4EtoT3dr4eOWO",
    sourceName: "Callum - Husky Trickster",
    publicOwnerId: null,
    libraryMetadata: "American; male; middle-aged; husky; premade character voice",
    tradeoff:
      "Husky texture may make the command feel physically suppressed, but its unsettling edge risks importing thriller color into the assault.",
  },
]);

export function roleFor(candidate) {
  const role = ROLES.find(({ id }) => id === candidate.roleId);
  if (!role) throw new Error(`candidate ${candidate.id} has unknown role ${candidate.roleId}`);
  return role;
}

export function auditionText(role) {
  return role.lines.map((line) => `${role.tag} ${line}`).join("\n\n");
}

export function requestFor(candidate) {
  const role = roleFor(candidate);
  return {
    text: auditionText(role),
    model_id: MODEL_ID,
    voice_settings: role.settings,
  };
}
