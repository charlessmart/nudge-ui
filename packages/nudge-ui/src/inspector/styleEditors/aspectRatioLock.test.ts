import { describe, expect, it } from "vitest";
import { reduceAspectRatio } from "./aspectRatioLock.ts";

describe("reduceAspectRatio", () => {
  it("reduces a measured size to its simplest whole-number ratio", () => {
    expect(reduceAspectRatio(1920, 1080)).toBe("16 / 9");
    expect(reduceAspectRatio(800, 600)).toBe("4 / 3");
    expect(reduceAspectRatio(500, 500)).toBe("1 / 1");
  });

  it("rounds fractional pixels before reducing them", () => {
    expect(reduceAspectRatio(1920.4, 1080.4)).toBe("16 / 9");
  });

  it("has no ratio for a side that does not measure", () => {
    expect(reduceAspectRatio(0, 1080)).toBeNull();
    expect(reduceAspectRatio(1920, 0)).toBeNull();
    expect(reduceAspectRatio(Number.NaN, 1080)).toBeNull();
    expect(reduceAspectRatio(0.4, 0.4)).toBeNull();
  });
});
