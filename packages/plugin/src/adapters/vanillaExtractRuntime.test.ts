import { describe, expect, it } from "vitest";
import type { TokenDefinition } from "../virtual/design-tokens.ts";
import {
  materializeVanillaExtractContract,
  mergeVanillaExtractContract,
} from "./vanillaExtractRuntime.ts";

describe("compiled vanilla-extract contract materialization", () => {
  it("uses actual compiled variable references without assuming a hash shape", () => {
    const entries = materializeVanillaExtractContract({
      color: {
        brand: "var(--color-brand__arbitrary_compiler_hash)",
        accent: "var(--ve_x7Q)",
      },
    }, { source: "src/theme.css.ts" });

    expect(entries).toEqual([
      expect.objectContaining({ name: "theme.color.brand", cssName: "--color-brand__arbitrary_compiler_hash" }),
      expect.objectContaining({ name: "theme.color.accent", cssName: "--ve_x7Q" }),
    ]);
  });

  it("keeps compiler declarations while overlaying semantic token metadata", () => {
    const base: TokenDefinition[] = [{
      name: "--color-brand__hash",
      cssName: "--color-brand__hash",
      declarations: [{
        value: "#123456",
        source: "src/theme.css.ts.vanilla.css",
        important: false,
        context: { selector: ".theme" },
      }],
    }];
    const entries = materializeVanillaExtractContract({ color: { brand: "var(--color-brand__hash)" } });
    const result = mergeVanillaExtractContract(base, entries);

    expect(result.tokenCatalog[0]).toMatchObject({
      name: "theme.color.brand",
      cssName: "--color-brand__hash",
      adapter: "vanilla-extract",
      declarations: [{ value: "#123456", source: "src/theme.css.ts.vanilla.css" }],
    });
    expect(result.tokens[0]).toMatchObject({ name: "theme.color.brand", value: "#123456" });
  });

  it("does not present a contract variable reference as a CSS declaration", () => {
    const entries = materializeVanillaExtractContract({ color: { brand: "var(--compiled-hash)" } });
    const result = mergeVanillaExtractContract([], entries);

    expect(result.tokenCatalog[0]).toMatchObject({
      name: "theme.color.brand",
      cssName: "--compiled-hash",
      declarations: [],
    });
    expect(result.tokens[0]).toMatchObject({ name: "theme.color.brand", value: "" });
  });
});
