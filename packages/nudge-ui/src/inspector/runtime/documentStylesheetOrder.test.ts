import { describe, expect, it } from "vitest";
import type { TokenDefinition } from "../../css/model/index.ts";
import { reconcileDocumentTokenCatalog } from "./documentStylesheetOrder.ts";

const duplicateToken: TokenDefinition = {
  cssName: "--surface",
  name: "--surface",
  declarations: [
    { value: "white", source: "base.css:1", order: 0, important: false, context: {} },
    { value: "black", source: "theme.css:1", order: 1, important: false, context: {} },
  ],
};

describe("reconcileDocumentTokenCatalog", () => {
  it("uses browser stylesheet order instead of directory discovery order", () => {
    const { catalog, diagnostics } = reconcileDocumentTokenCatalog([duplicateToken], {
      projectPaths: ["theme.css", "base.css"],
      complete: true,
    });
    const [result] = catalog;

    expect(result?.declarations.map((declaration) => declaration.source)).toEqual([
      "theme.css:1",
      "base.css:1",
    ]);
    expect(result?.declarations.map((declaration) => declaration.order)).toEqual([0, 4]);
    expect(diagnostics).toEqual([]);
  });

  it("keeps discovery order and reports diagnostics when stylesheet evidence is incomplete", () => {
    const { catalog, diagnostics } = reconcileDocumentTokenCatalog([duplicateToken], {
      projectPaths: ["theme.css", "base.css"],
      complete: false,
    });
    const [result] = catalog;

    expect(result).toBe(duplicateToken);
    expect(result?.declarations.map((declaration) => declaration.source)).toEqual([
      "base.css:1",
      "theme.css:1",
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "token-order-unresolved",
        module: "document-css",
      }),
    ]);
    expect(diagnostics[0]?.message).toContain("--surface");
  });

  it("names the unmatched source path when browser evidence misses one sheet", () => {
    const { catalog, diagnostics } = reconcileDocumentTokenCatalog([duplicateToken], {
      projectPaths: ["theme.css"],
      complete: true,
    });
    const [result] = catalog;

    expect(result?.declarations).toHaveLength(2);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "token-order-unresolved",
        module: "base.css",
      }),
    ]);
  });

  it("returns the original catalog identity when no declaration is duplicated", () => {
    const singleton: TokenDefinition = {
      cssName: "--space",
      name: "--space",
      declarations: [
        { value: "4px", source: "base.css:1", order: 0, important: false, context: {} },
      ],
    };
    const { catalog: result, diagnostics } = reconcileDocumentTokenCatalog([singleton], {
      projectPaths: [],
      complete: false,
    });

    expect(result).toEqual([singleton]);
    expect(diagnostics).toEqual([]);
  });
});
