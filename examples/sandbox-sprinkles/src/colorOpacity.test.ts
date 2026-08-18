import { describe, expect, it } from "vitest";
import { colorWithAlpha } from "./colorOpacity.ts";

describe("colorWithAlpha", () => {
  it("keeps the source token reference inside a color-mix alpha", () => {
    expect(colorWithAlpha("var(--color-brand)", 30))
      .toBe("color-mix(in srgb, var(--color-brand) 30%, transparent)");
  });
});
