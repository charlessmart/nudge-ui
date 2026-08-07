import { describe, expect, it } from "vitest";
import {
  createPublishedVanillaExtractContribution,
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

  it("normalizes Vite contract facts into package provenance", () => {
    const contribution = createPublishedVanillaExtractContribution({
      moduleSpecifier: "@fixture/theme-contract",
      loaded: true,
      contract: { color: { primary: "var(--primary__hash)" } },
      diagnostics: [],
      resolvedModuleId: "/repo/app/node_modules/@fixture/theme-contract/index.js",
      projectRoot: "/repo/app",
    });

    expect(contribution).toMatchObject({
      id: "vanilla-extract-contract",
      order: 1,
      definitions: [expect.objectContaining({
        name: "theme.color.primary",
        cssName: "--primary__hash",
        origin: "package",
      })],
    });
  });

  it("normalizes loader failures without exposing Vite assembly to the entrypoint", () => {
    expect(createPublishedVanillaExtractContribution({
      moduleSpecifier: "@fixture/theme-contract",
      loaded: true,
      contract: null,
      diagnostics: [{
        code: "vanilla-extract-contract-missing-export",
        module: "@fixture/theme-contract",
        exportName: "vars",
        message: "Missing vars.",
      }],
      resolvedModuleId: "/repo/app/theme-contract.ts",
      projectRoot: "/repo/app",
    })).toMatchObject({
      diagnostics: [{
        code: "vanilla-extract-contract-missing-export",
        artifact: "@fixture/theme-contract",
        exportName: "vars",
        message: "Missing vars.",
      }],
    });
  });
});
