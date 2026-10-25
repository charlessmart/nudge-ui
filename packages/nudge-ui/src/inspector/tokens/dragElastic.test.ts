import { describe, expect, it } from "vitest";
import { elasticOffset, wallOffset } from "./dragElastic.ts";

describe("elasticOffset", () => {
  it("is signed, zero at rest, and eases towards its cap", () => {
    expect(elasticOffset(0)).toBe(0);
    expect(elasticOffset(-200)).toBeCloseTo(-elasticOffset(200));
    expect(elasticOffset(800)).toBeGreaterThan(elasticOffset(200));
    expect(Math.abs(elasticOffset(1e9))).toBeLessThanOrEqual(8);
  });
});

describe("wallOffset", () => {
  it("is signed with the overshoot and zero before any push", () => {
    expect(wallOffset(0)).toBe(0);
    expect(wallOffset(-40)).toBeCloseTo(-wallOffset(40));
    expect(wallOffset(40)).toBeGreaterThan(0);
  });

  it("grows with the push and stops at its cap", () => {
    expect(wallOffset(100)).toBeGreaterThan(wallOffset(20));
    expect(wallOffset(1e9)).toBe(5);
  });
});
