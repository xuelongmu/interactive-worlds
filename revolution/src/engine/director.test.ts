import { describe, expect, it, vi } from "vitest";
import {
  completeCutsceneHandoff,
  defaultGuidanceForCue,
  runnerHasMovementInput,
} from "./director";

describe("Director held movement detection", () => {
  it("delegates through the runner wrapper used for splat scenes", () => {
    const hasMovementInput = vi.fn(() => true);

    expect(runnerHasMovementInput({ hasMovementInput })).toBe(true);
    expect(hasMovementInput).toHaveBeenCalledOnce();
  });

  it("does not report movement for runners without splat input", () => {
    expect(runnerHasMovementInput({})).toBe(false);
    expect(runnerHasMovementInput(null)).toBe(false);
  });

  it("queues aftermath before held movement can unlock the runner", () => {
    const order: string[] = [];

    completeCutsceneHandoff(
      () => order.push("LEX-080"),
      () => order.push("unlock/LEX-090")
    );

    expect(order).toEqual(["LEX-080", "unlock/LEX-090"]);
  });
});

describe("Director beat guidance", () => {
  it("does not describe renderer handoffs as player interactions", () => {
    for (const name of ["boarded", "control-granted", "cutscene-volley-complete", "signature-dwell"]) {
      expect(defaultGuidanceForCue({
        id: `SYSTEM-${name}`,
        trigger: { type: "action", name },
      })).toBeNull();
    }
  });

  it("keeps a default prompt for actual interaction actions", () => {
    expect(defaultGuidanceForCue({
      id: "PLAYER-ACTION",
      trigger: { type: "action", name: "quill-pickup" },
    })).toBe("Interact with the scene to continue");
  });
});
