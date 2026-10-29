import { describe, expect, it } from "vitest";
import { animationSpeedAtPosition, animationSpeedToPosition, formatAnimationSpeed, snapAnimationSpeed } from "./animationSpeed.ts";

describe("animation speed scale", () => {
  it("places a speed along the rail in proportion to full speed", () => {
    expect([animationSpeedToPosition(0.1), animationSpeedToPosition(0.5), animationSpeedToPosition(1)]).toEqual([0.1, 0.5, 1]);
  });

  it("snaps every point to the nearest tenth, never below the slowest speed", () => {
    expect(animationSpeedAtPosition(-1)).toBe(0.1);
    expect(animationSpeedAtPosition(0.02)).toBe(0.1);
    expect(animationSpeedAtPosition(2)).toBe(1);
    expect(animationSpeedAtPosition(0.34)).toBe(0.3);
    expect(animationSpeedAtPosition(0.36)).toBe(0.4);
  });

  it("keeps steps clean of floating-point drift", () => {
    expect(snapAnimationSpeed(0.1 + 0.2)).toBe(0.3);
    expect(formatAnimationSpeed(snapAnimationSpeed(0.7 + 0.1 + 0.1))).toBe("0.9×");
  });
});
