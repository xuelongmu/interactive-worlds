import type { Lateral, Longitudinal, LookH, LookV } from "../renderers/worldmodel";

export const WORLD_MODEL_PROMPT_BUDGET = 1_900;

export interface WorldModelPromptLayers {
  readonly base: string;
  readonly lookH: LookH;
  readonly movement: Readonly<{ longitudinal: Longitudinal; lateral: Lateral }>;
  readonly events: readonly string[];
  readonly lookV: LookV;
}

const CAMERA_STATIC = "Camera: first-person eye level, continuous and physically grounded.";
const MOVEMENT_STATIC = "Movement: preserve the same place, people, weather, lighting, and historical material culture.";

function cameraDynamic(look: LookH): string {
  if (look === "left") return "Camera motion: turn left smoothly.";
  if (look === "right") return "Camera motion: turn right smoothly.";
  return "Camera motion: hold the current heading.";
}

function movementDynamic({ longitudinal, lateral }: WorldModelPromptLayers["movement"]): string {
  if (longitudinal === "forward") return "Movement intent: move forward at a walking pace.";
  if (longitudinal === "back") return "Movement intent: step backward carefully.";
  if (lateral === "strafe_left") return "Movement intent: sidestep left only while forward motion is idle.";
  if (lateral === "strafe_right") return "Movement intent: sidestep right only while forward motion is idle.";
  return "Movement intent: remain in place.";
}

function verticalDynamic(look: LookV): string {
  if (look === "up") return "Vertical camera: look upward slightly.";
  if (look === "down") return "Vertical camera: look downward slightly.";
  return "Vertical camera: keep a level horizon.";
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Rebuilds the complete prompt in one stable order. No prior prompt text is
 * appended, so press/release cycles cannot accumulate corrective clauses. */
export function composeWorldModelPrompt(
  layers: WorldModelPromptLayers,
  budget = WORLD_MODEL_PROMPT_BUDGET,
): string {
  const ordered = [
    normalized(layers.base),
    CAMERA_STATIC,
    cameraDynamic(layers.lookH),
    MOVEMENT_STATIC,
    movementDynamic(layers.movement),
    ...layers.events.map(normalized).filter(Boolean).map((event) => `Active event: ${event}`),
    verticalDynamic(layers.lookV),
  ];
  const prompt = ordered.filter(Boolean).join("\n");
  if (prompt.length <= budget) return prompt;
  if (budget <= 1) return prompt.slice(0, Math.max(0, budget));
  return `${prompt.slice(0, budget - 1).trimEnd()}…`;
}

