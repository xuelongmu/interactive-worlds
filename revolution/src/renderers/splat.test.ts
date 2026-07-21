import { describe, expect, it } from "vitest";
import { resolveSplatLook, resolveSplatMovement } from "./splat";

describe("Splat semantic movement", () => {
  it("keeps diagonal input camera-relative and at the authored walking speed", () => {
    const distance = resolveSplatMovement(
      { forward: 1, strafe: 1 },
      Math.PI / 2,
      1.4,
      0.5
    );
    expect(distance.length()).toBeCloseTo(0.7);
    expect(distance.x).toBeLessThan(0);
    expect(distance.z).toBeLessThan(0);
  });

  it("returns no movement for semantic idle", () => {
    expect(resolveSplatMovement({ forward: 0, strafe: 0 }, 0, 1.4, 1).length()).toBe(0);
  });

  it("maps look deltas onto yaw and clamps pitch", () => {
    expect(resolveSplatLook(0, 1.19, { yaw: 0.2, pitch: 0.2, mode: "delta" })).toEqual({
      yaw: -0.2,
      pitch: 1.2,
    });
  });
});
