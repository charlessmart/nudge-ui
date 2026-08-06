import { describe, expect, it } from "vitest";
import {
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
});
