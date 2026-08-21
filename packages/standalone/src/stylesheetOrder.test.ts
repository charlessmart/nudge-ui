import { describe, expect, it } from "vitest";
import type { TokenDefinition } from "@design-tool/css/model";
import { reconcileStandaloneTokenCatalog } from "./stylesheetOrder.ts";

const duplicateToken: TokenDefinition = {
  cssName: "--surface",
  name: "--surface",
  declarations: [
    { value: "white", source: "base.css:1", order: 0, important: false, context: {} },
    { value: "black", source: "theme.css:1", order: 1, important: false, context: {} },
  ],
};

describe("reconcileStandaloneTokenCatalog", () => {
  it("uses reverse CSSOM stylesheet order instead of directory discovery order", () => {
    const [result] = reconcileStandaloneTokenCatalog([duplicateToken], {
      projectPaths: ["theme.css", "base.css"],
      complete: true,
    });

    expect(result?.declarations.map((declaration) => declaration.source)).toEqual([
      "theme.css:1",
      "base.css:1",
    ]);
    expect(result?.declarations.map((declaration) => declaration.order)).toEqual([0, 4]);
  });

  it("removes the winner claim when stylesheet evidence is incomplete", () => {
    const [result] = reconcileStandaloneTokenCatalog([duplicateToken], {
      projectPaths: ["theme.css", "base.css"],
      complete: false,
    });

    expect(result?.declarations).toEqual([]);
  });
});
