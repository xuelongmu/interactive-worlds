export interface WorldModelInputCommand {
  longitudinal: "idle" | "forward" | "back";
  lateral: "idle" | "strafe_left" | "strafe_right";
  lookH: "idle" | "left" | "right";
  lookV: "idle" | "up" | "down";
}

export function resolveWorldModelInput(keys: ReadonlySet<string>, locked: boolean): WorldModelInputCommand {
  if (locked) {
    return { longitudinal: "idle", lateral: "idle", lookH: "idle", lookV: "idle" };
  }
  return {
    longitudinal: keys.has("KeyW") ? "forward" : keys.has("KeyS") ? "back" : "idle",
    lateral: keys.has("KeyA") ? "strafe_left" : keys.has("KeyD") ? "strafe_right" : "idle",
    lookH: keys.has("ArrowLeft") ? "left" : keys.has("ArrowRight") ? "right" : "idle",
    lookV: keys.has("ArrowUp") ? "up" : keys.has("ArrowDown") ? "down" : "idle",
  };
}
