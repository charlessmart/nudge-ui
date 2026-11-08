import { describe, expect, it } from "vitest";
import { reactComponentFramework } from "./react.ts";
import { findSheetWrapperFile, isSheetWrapperFile, serializeSheetDefinition, suggestedSheetWrapperFile } from "./sheet.ts";

describe("sheet wrapper", () => {
  it("finds the configured file, else the first conventional name that exists", () => {
    const existing = new Set(["/app/nudge.sheet.jsx", "/app/nudge.sheet.ts", "/app/src/Wrap.tsx"]);
    const exists = (file: string): boolean => existing.has(file);
    expect(findSheetWrapperFile(reactComponentFramework, "/app", undefined, exists)).toBe("/app/nudge.sheet.jsx");
    expect(findSheetWrapperFile(reactComponentFramework, "/app/", "./src/Wrap.tsx", exists)).toBe("/app/src/Wrap.tsx");
    expect(findSheetWrapperFile(reactComponentFramework, "/app", "src/Missing.tsx", exists)).toBeNull();
    expect(findSheetWrapperFile(reactComponentFramework, "/app", undefined, () => false)).toBeNull();
  });

  it("recognizes only root-level conventional names", () => {
    expect(isSheetWrapperFile(reactComponentFramework, "/app/nudge.sheet.tsx", "/app")).toBe(true);
    expect(isSheetWrapperFile(reactComponentFramework, "/app/src/nudge.sheet.tsx", "/app")).toBe(false);
  });

  it("suggests the adapter's first conventional name", () => {
    expect(suggestedSheetWrapperFile(reactComponentFramework)).toBe("nudge.sheet.tsx");
  });
});

describe("serializeSheetDefinition", () => {
  it("addresses modules through the host's specifiers", () => {
    const lines = serializeSheetDefinition({
      contracts: [
        { componentId: "src/Button#Button", name: "Button", file: "src/Button.tsx", props: [], provenance: "typescript" },
        { componentId: "src/Button#Button", name: "Button", file: "src/Button.tsx", props: [], provenance: "typescript" },
      ],
      componentSpecifier: (contract) => `../../${contract.file}`,
      wrapperSpecifier: "../../nudge.sheet.tsx",
      wrapperPath: "nudge.sheet.tsx",
    });
    const source = lines.join("\n");
    expect(source.match(/import\("\.\.\/\.\.\/src\/Button\.tsx"\)/g)).toHaveLength(1);
    expect(source).toContain('sheetWrapper: { file: "nudge.sheet.tsx", load: () => import("../../nudge.sheet.tsx")');
    expect(lines.every((line) => line.endsWith(",") || line.endsWith("{"))).toBe(true);
  });
});
