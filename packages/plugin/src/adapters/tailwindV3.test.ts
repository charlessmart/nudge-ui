import { describe, expect, it } from "vitest";
import { detectTailwindV3Config, extractTailwindV3Tokens, resolveTailwindV3ClassName, tailwindV3ColorDeclaration } from "./tailwindV3.ts";

const config = {
  theme: {
    colors: { brand: "#123456", blue: { 500: "#3b82f6" } },
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

  it("fails safely for dynamic and unsupported output", () => {
    expect(resolveTailwindV3ClassName("bg-[color:var(--x)]", config)).toMatchObject({ token: null, confidence: "unknown" });
    expect(detectTailwindV3Config({ theme: { colors: {} }, __tailwindVersion: 4 })).toBe(false);
  });
});
