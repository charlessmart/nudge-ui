import { describe, expect, it } from "vitest";
import { createVanillaExtractAdapter, extractVanillaExtractTokens, resolveSprinklesClassName } from "./vanillaExtract.ts";
import { createTokenAdapterRegistry } from "./registry.ts";

const options = {
  themeContract: { color: { brand: "var(--color-brand__hash)", accent: "var(--color-accent__hash)" }, space: { sm: "var(--space-sm__hash)" } },
  cssValues: { "--color-brand__hash": "#123456", "--color-accent__hash": "#abcdef", "--space-sm__hash": "8px" },
  classMap: { "sprinkles-brand": { token: "theme.color.brand", property: "color" } },
};

describe("vanilla-extract/Sprinkles adapter", () => {
  it("walks nested contracts into human-readable project tokens", () => {
    expect(extractVanillaExtractTokens(options)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.color.brand", cssName: "--color-brand__hash", value: "#123456", adapter: "vanilla-extract" }),
      expect.objectContaining({ name: "theme.space.sm" }),
    ]));
  });

  it("maps an atomic class and falls back for an unknown class", () => {
    expect(resolveSprinklesClassName("sprinkles-brand", options)).toMatchObject({ property: "color", token: { name: "theme.color.brand" }, confidence: "exact" });
    expect(resolveSprinklesClassName("sprinkles-unknown", options)).toBeNull();
  });

  it("merges adapter discovery and universal fallback through one registry", () => {
    const adapter = createVanillaExtractAdapter(options);
    const registry = createTokenAdapterRegistry([adapter]);
    expect(registry.detect().map((candidate) => candidate.name)).toEqual(["vanilla-extract"]);
    expect(registry.extractTokens()).toHaveLength(3);
    expect(registry.resolveClassName("missing-class")).toBeNull();
  });
});
