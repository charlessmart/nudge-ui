import { describe, expect, it } from "vitest";
import {
  detectStylesheetDialects,
  dialectsInUse,
  interpretDialects,
  isDialectInternalProperty,
  observedDialects,
  stylingDialect,
  stylingSystemLabel,
  tailwindV3Utility,
  tailwindV4Utility,
} from "./index.ts";

describe("stylesheet detection", () => {
  it("recognises each Tailwind version by its own markers", () => {
    expect(detectStylesheetDialects('@import "tailwindcss";')).toEqual(["tailwind-v4"]);
    expect(detectStylesheetDialects("@theme { --color-brand: red; }")).toEqual(["tailwind-v4"]);
    expect(detectStylesheetDialects("@tailwind base;\n@tailwind utilities;")).toEqual(["tailwind-v3"]);
    expect(detectStylesheetDialects('@import "tailwindcss";\n@tailwind utilities;')).toEqual(["tailwind-v4"]);
    expect(detectStylesheetDialects(".button { color: red; }")).toEqual([]);
  });

  it("does not take Tailwind's helper variables as evidence of either version", () => {
    expect(detectStylesheetDialects(".bg-brand { --tw-bg-opacity: 1; }")).toEqual([]);
  });
});

describe("dialects in use", () => {
  it("lists token and detected dialects once, in priority order", () => {
    expect(dialectsInUse(
      [{ adapter: "tailwind-v4" }, { adapter: "vanilla-extract" }, { adapter: undefined }, { adapter: "tailwind-v4" }],
      ["tailwind-v4"],
    )).toEqual(["vanilla-extract", "tailwind-v4"]);
  });

  it("ignores adapters that are not dialects", () => {
    expect(dialectsInUse([{ adapter: "custom" }])).toEqual([]);
  });

  it("reads the dialects an interpretation proved", () => {
    expect(observedDialects(interpretDialects())).toEqual([]);
    expect(observedDialects(interpretDialects({ tailwindV3Css: true, tailwindV4Css: false }))).toEqual(["tailwind-v3"]);
    expect(observedDialects(interpretDialects({ tailwindV4Css: true }))).toEqual(["tailwind-v4"]);
  });

  it("labels the styling system from its dialects", () => {
    expect(stylingSystemLabel([])).toBe("CSS custom properties");
    expect(stylingSystemLabel(["tailwind-v4"])).toBe("Tailwind v4");
    expect(stylingSystemLabel(["vanilla-extract", "tailwind-v4"])).toBe("vanilla-extract (sprinkles) and Tailwind v4");
  });
});

describe("Tailwind utility names", () => {
  it("names v3 theme tokens by section and property", () => {
    expect(tailwindV3Utility("theme.colors.blue.500", "background-color")).toBe("bg-blue-500");
    expect(tailwindV3Utility("theme.colors.brand", "color")).toBe("text-brand");
    expect(tailwindV3Utility("theme.colors.brand.DEFAULT", "border-color")).toBe("border-brand");
    expect(tailwindV3Utility("theme.spacing.0.5", "padding-top")).toBe("pt-0.5");
    expect(tailwindV3Utility("theme.borderRadius.DEFAULT", "border-radius")).toBe("rounded");
    expect(tailwindV3Utility("theme.fontWeight.bold", "font-weight")).toBe("font-bold");
  });

  it("names v4 theme variables by namespace and property", () => {
    expect(tailwindV4Utility("--color-brand", "background-color")).toBe("bg-brand");
    expect(tailwindV4Utility("--radius-lg", "border-radius")).toBe("rounded-lg");
    expect(tailwindV4Utility("--font-weight-semibold", "font-weight")).toBe("font-semibold");
    expect(tailwindV4Utility("--font-display", "font-family")).toBe("font-display");
    expect(tailwindV4Utility("--text-lg", "font-size")).toBe("text-lg");
    expect(tailwindV4Utility("--spacing-gutter", "gap")).toBe("gap-gutter");
  });

  it("names nothing when the token does not belong to the property", () => {
    expect(tailwindV3Utility("theme.colors.brand", "padding")).toBeNull();
    expect(tailwindV4Utility("--color-brand", "font-size")).toBeNull();
    expect(tailwindV4Utility("--text-lg--line-height", "font-size")).toBeNull();
    expect(tailwindV4Utility("--brand", "color")).toBeNull();
  });

  it("is each Tailwind dialect's source form", () => {
    expect(stylingDialect("tailwind-v3")?.sourceForm?.({ name: "theme.colors.brand" }, "fill")).toBe("fill-brand");
    expect(stylingDialect("tailwind-v4")?.sourceForm?.({ name: "brand", cssName: "--color-brand" }, "stroke")).toBe("stroke-brand");
    expect(stylingDialect("vanilla-extract")?.sourceForm).toBeUndefined();
  });
});

describe("dialect behaviour", () => {
  it("reads a Tailwind v4 opacity utility as its base token", () => {
    expect(stylingDialect("tailwind-v4")?.readClass?.("bg-brand/40")).toEqual({
      properties: ["background-color", "background"],
      tokenCssName: "--color-brand",
      expression: "color-mix(in oklab, var(--color-brand) 40%, transparent)",
      alpha: "40%",
    });
    expect(stylingDialect("tailwind-v4")?.readClass?.("bg-brand")).toBeNull();
  });

  it("claims Tailwind helper variables as plumbing", () => {
    expect(isDialectInternalProperty("--tw-ring-color")).toBe(true);
    expect(isDialectInternalProperty("--color-brand")).toBe(false);
  });
});
