import { describe, expect, it } from "vitest";
import type { TokenDefinition } from "../virtual/design-tokens.ts";
import {
  enrichVanillaExtractCatalog,
  materializeVanillaExtractContract,
} from "./vanillaExtractContract.ts";

describe("published vanilla-extract contracts", () => {
  it("materialises nested paths from actual custom-property references", () => {
    const entries = materializeVanillaExtractContract({
      color: { content: { primary: "var(--content_primary__compiler_hash)" } },
    }, { prefix: "design", source: "@fixture/contract" });

    expect(entries).toEqual([expect.objectContaining({
      name: "design.color.content.primary",
      cssName: "--content_primary__compiler_hash",
      origin: "package",
      editable: false,
    })]);
  });

  it("enriches a CSS declaration without replacing CSS value, source, or package provenance", () => {
    const catalog: TokenDefinition[] = [{
      name: "--color-content-primary",
      cssName: "--color-content-primary",
      origin: "package",
      editable: false,
      declarations: [{
        value: "#20211f",
        source: "@fixture/theme.css:4",
        important: false,
        context: { selector: ":root" },
      }],
    }];
    const contract = materializeVanillaExtractContract({
      color: { content: { primary: "var(--color-content-primary)" } },
    }, { source: "@fixture/contract" });

    const enriched = enrichVanillaExtractCatalog(catalog, contract);
    expect(enriched).toEqual([expect.objectContaining({
      name: "theme.color.content.primary",
      cssName: "--color-content-primary",
      adapter: "vanilla-extract",
      origin: "package",
      editable: false,
      declarations: [expect.objectContaining({ value: "#20211f", source: "@fixture/theme.css:4" })],
    })]);
  });

  it("does not create a candidate for a contract variable absent from active CSS", () => {
    const entries = materializeVanillaExtractContract({
      color: { missing: "var(--not-in-the-page)" },
    }, { source: "@fixture/contract" });

    expect(enrichVanillaExtractCatalog([], entries)).toEqual([]);
  });
});
