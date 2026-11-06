import { describe, expect, it } from "vitest";
import type { ComponentContract } from "../../compiler/index.ts";
import {
  findSheetWrapperFile,
  isSheetWrapperFile,
  componentSheetModuleTarget,
  collectSheetStyleImports,
  createComponentSheetDocument,
  extractHtmlEntries,
  extractModuleSpecifiers,
  serializeComponentSheetEntry,
} from "./componentSheet.ts";

function graph(files: Record<string, string>) {
  return {
    read: (file: string) => files[file] ?? null,
    async resolve(specifier: string, importer: string) {
      if (specifier.startsWith("/src/")) return `/app${specifier}`;
      if (specifier.startsWith("./")) {
        const dir = importer.slice(0, importer.lastIndexOf("/"));
        const joined = `${dir}/${specifier.slice(2)}`;
        return files[`${joined}.tsx`] !== undefined ? `${joined}.tsx` : joined;
      }
      if (specifier === "pkg/styles.css") return "/app/node_modules/pkg/styles.css";
      if (specifier === "react") return "/app/node_modules/react/index.js";
      return null;
    },
    isProjectSource: (file: string) => file.startsWith("/app/src/"),
  };
}

describe("module specifier extraction", () => {
  it("returns static, re-export and dynamic specifiers in source order", () => {
    const code = `import "./a.css";
// import "./commented.css";
import { b } from './b';
/* import "./block.css" */
export * from "./c";
const lazy = () => import("./d");`;
    expect(extractModuleSpecifiers(code)).toEqual(["./a.css", "./b", "./c", "./d"]);
  });
});

describe("html entries", () => {
  it("lists stylesheet links and module scripts in document order", () => {
    const html = `<link rel="stylesheet" href="/base.css"><script type="module" src="/src/main.tsx"></script>
<script>console.log(1)</script><script type="module">import "./inline.css"</script>`;
    expect(extractHtmlEntries(html)).toEqual([
      { kind: "stylesheet", href: "/base.css" },
      { kind: "module", src: "/src/main.tsx" },
      { kind: "inline", code: 'import "./inline.css"' },
    ]);
  });
});

describe("collectSheetStyleImports", () => {
  it("walks project imports, including dynamic ones, and keeps first-seen order", async () => {
    const files = {
      "/app/src/main.tsx": `import "./reset.css"; import { App } from "./App"; import "pkg/styles.css"; import("./Lazy");`,
      "/app/src/App.tsx": `import "./app.css"; import "./reset.css"; import react from "react"; import "./m.module.css";`,
      "/app/src/Lazy.tsx": `import "./lazy.css"; import x from "./icon.svg?url";`,
      "/app/node_modules/react/index.js": `import "./never.css";`,
    };
    const base = graph(files);
    const result = await collectSheetStyleImports(
      { file: "/app/index.html", source: '<script type="module" src="/src/main.tsx"></script>' },
      {
        ...base,
        async resolve(specifier, importer) {
          if (specifier.endsWith(".css") && specifier.startsWith("./")) {
            const dir = importer.slice(0, importer.lastIndexOf("/"));
            return `${dir}/${specifier.slice(2)}`;
          }
          return base.resolve(specifier, importer);
        },
      },
    );
    expect(result).toEqual([
      "/app/src/reset.css",
      "/app/src/app.css",
      "/app/node_modules/pkg/styles.css",
      "/app/src/lazy.css",
    ]);
  });
});

describe("serializeComponentSheetEntry", () => {
  const contracts: ComponentContract[] = [
    { componentId: "src/Button#Button", name: "Button", file: "src/Button.tsx", props: [], provenance: "typescript" },
    { componentId: "@ui/kit#Chip", name: "Chip", file: "@ui/kit", props: [], provenance: "package-manifest" },
  ];

  it("imports styles first and maps contracts to lazy loaders", () => {
    const source = serializeComponentSheetEntry({
      contracts,
      styles: ["/@fs/app/src/index.css"],
      projectFile: (contract) => (contract.file.startsWith("src/") ? `/app/${contract.file}` : null),
    });
    const lines = source.split("\n");
    expect(lines[0]).toBe('import "/@fs/app/src/index.css";');
    expect(source).toContain('"src/Button#Button": () => import("/@fs/app/src/Button.tsx").then((m) => m["Button"] ?? m.default)');
    expect(source).toContain('"@ui/kit#Chip": () => import("@ui/kit").then((m) => m["Chip"] ?? m.default)');
    expect(source).toContain("mountComponentSheet({");
    expect(source).toContain('get("component")');
  });
});

describe("createComponentSheetDocument", () => {
  it("references the virtual sheet entry", () => {
    expect(createComponentSheetDocument()).toContain("virtual:nudge-ui-component-sheet");
  });
});

describe("componentSheetModuleTarget", () => {
  it("reads the component a sheet module was requested for", () => {
    expect(componentSheetModuleTarget("virtual:nudge-ui-component-sheet?component=src%2Fds%2FButton%23Button")).toBe("src/ds/Button#Button");
    expect(componentSheetModuleTarget("\0virtual:nudge-ui-component-sheet")).toBeNull();
    expect(componentSheetModuleTarget("virtual:nudge-ui-components")).toBeUndefined();
  });

  it("points the sheet document at that component's module", () => {
    expect(createComponentSheetDocument("src/ds/Button#Button")).toContain("?component=src%2Fds%2FButton%23Button");
  });
});

describe("sheet wrapper", () => {
  const button: ComponentContract = {
    componentId: "src/Button.tsx#Button",
    name: "Button",
    file: "src/Button.tsx",
    props: [],
    provenance: "typescript",
  };

  it("finds the configured file, else the first conventional name that exists", () => {
    const existing = new Set(["/app/nudge.sheet.jsx", "/app/nudge.sheet.ts", "/app/src/Wrap.tsx"]);
    const exists = (file: string): boolean => existing.has(file);
    expect(findSheetWrapperFile("/app", undefined, exists)).toBe("/app/nudge.sheet.jsx");
    expect(findSheetWrapperFile("/app/", "./src/Wrap.tsx", exists)).toBe("/app/src/Wrap.tsx");
    expect(findSheetWrapperFile("/app", "src/Missing.tsx", exists)).toBeNull();
    expect(findSheetWrapperFile("/app", undefined, () => false)).toBeNull();
  });

  it("recognizes only root-level conventional names", () => {
    expect(isSheetWrapperFile("/app/nudge.sheet.tsx", "/app")).toBe(true);
    expect(isSheetWrapperFile("/app/src/nudge.sheet.tsx", "/app")).toBe(false);
  });

  it("loads the wrapper on demand so a broken one cannot blank the sheet", () => {
    const source = serializeComponentSheetEntry({
      contracts: [button],
      styles: [],
      wrapper: "/app/nudge.sheet.tsx",
      wrapperPath: "nudge.sheet.tsx",
      projectFile: () => null,
    });
    expect(source).toContain('sheetWrapper: { file: "nudge.sheet.tsx", load: () => import("/@fs/app/nudge.sheet.tsx")');
    expect(source).not.toMatch(/^import .* from "\/@fs\/app\/nudge\.sheet/m);
  });

  it("names where a wrapper would go when the project has none", () => {
    const source = serializeComponentSheetEntry({ contracts: [button], styles: [], projectFile: () => null });
    expect(source).toContain('sheetWrapper: { file: "nudge.sheet.tsx", load: null }');
  });
});
