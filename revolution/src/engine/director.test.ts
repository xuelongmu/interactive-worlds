import { describe, expect, it, vi } from "vitest";
import { completeCutsceneHandoff, runnerHasMovementInput } from "./director";

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
