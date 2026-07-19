import { describe, expect, it } from "vitest";
import { createTailwindV3Adapter, detectTailwindV3Config, extractTailwindV3Tokens, resolveTailwindV3ClassName, tailwindV3ColorDeclaration } from "./tailwindV3.ts";

const config = {
  theme: {
    colors: { brand: "#123456", blue: { 500: "#3b82f6" } },
    spacing: { 3: "0.75rem", 4: "1rem" },
    borderRadius: { md: "0.375rem" },
    extend: { colors: { accent: "#abcdef" } },
  },
};

describe("Tailwind v3 adapter", () => {
  it("detects a static v3 config and extracts human-readable theme paths", () => {
    expect(detectTailwindV3Config(config)).toBe(true);
    expect(extractTailwindV3Tokens(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.colors.brand", adapter: "tailwind-v3", origin: "project" }),
      expect.objectContaining({ name: "theme.colors.blue.500" }),
    ]));
  });

  it("maps configured color utilities and opacity independently", () => {
    const mapping = resolveTailwindV3ClassName("bg-brand/10", config);
    expect(mapping).toMatchObject({ alpha: "10%", token: { name: "theme.colors.brand" }, authored: "bg-brand/10" });
    expect(tailwindV3ColorDeclaration(mapping.token!, "--tw-bg-opacity")).toContain("var(--tw-bg-opacity)");
  });

  it("catalogues config-backed spacing as literal preview values without inventing a CSS variable", () => {
    const spacing = extractTailwindV3Tokens(config).find((entry) => entry.name === "theme.spacing.3");
    expect(spacing).toMatchObject({ value: "0.75rem", cssValue: "0.75rem", adapter: "tailwind-v3" });
    expect(spacing).not.toHaveProperty("cssName");
    expect(extractTailwindV3Tokens(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.borderRadius.md", value: "0.375rem" }),
    ]));
  });

  it("uses the standard adapter seam and ignores variant prefixes for configured colors", () => {
    const adapter = createTailwindV3Adapter(config);
    expect(adapter.detect()).toBe(true);
    expect(adapter.resolveClassName?.("md:hover:bg-brand/10")).toMatchObject({
      className: "md:hover:bg-brand/10",
      token: { name: "theme.colors.brand" },
      confidence: "exact",
    });
  });

  it("fails safely for dynamic and unsupported output", () => {
    expect(resolveTailwindV3ClassName("bg-[color:var(--x)]", config)).toMatchObject({ token: null, confidence: "unknown" });
    expect(detectTailwindV3Config({ theme: { colors: {} }, __tailwindVersion: 4 })).toBe(false);
  });
});
