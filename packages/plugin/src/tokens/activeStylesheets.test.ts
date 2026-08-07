import { describe, expect, it } from "vitest";
import { cssImportSpecifiers, discoverCssImportGraph } from "./activeStylesheets.ts";

describe("cssImportSpecifiers", () => {
  it("recognises quoted and url imports but ignores commented-out stylesheets", () => {
    expect(cssImportSpecifiers(`
      /* @import "not-active.css"; */
      @import "theme.css" layer(tokens);
      @import url("foundation.css");
      @import url(print.css) print;
    `)).toEqual(["theme.css", "foundation.css", "print.css"]);
  });
});

describe("discoverCssImportGraph", () => {
  it("follows only nested CSS imports reachable from host stylesheets", async () => {
    const files: Record<string, string> = {
      "/app/src/styles.css": '@import "@fixture/theme.css"; :root { --project: 1; }',
      "/app/node_modules/@fixture/theme.css": '@import "./foundation.css"; :root { --color-content-primary: #20211f; }',
      "/app/node_modules/@fixture/foundation.css": ':root { --spacing-200: 8px; }',
      "/app/node_modules/unrelated/tokens.css": ':root { --should-not-appear: hotpink; }',
    };
    const graph = await discoverCssImportGraph(["/app/src/styles.css"], {
      read: (id) => {
        const value = files[id];
        if (value === undefined) throw new Error("missing");
        return value;
      },
      resolve: async (specifier, importer) => {
        if (specifier === "@fixture/theme.css") return "/app/node_modules/@fixture/theme.css";
        if (specifier === "./foundation.css" && importer.endsWith("theme.css")) return "/app/node_modules/@fixture/foundation.css";
        return null;
      },
    });

    expect([...graph.files.keys()]).toEqual([
      "/app/src/styles.css",
      "/app/node_modules/@fixture/theme.css",
      "/app/node_modules/@fixture/foundation.css",
    ]);
    expect(graph.files.has("/app/node_modules/unrelated/tokens.css")).toBe(false);
  });

  it("records missing and unreadable imports without failing the reachable catalog", async () => {
    const graph = await discoverCssImportGraph(["/app/styles.css"], {
      read: (id) => {
        if (id === "/app/styles.css") {
          return '@import "missing.css"; @import "unreadable.css"; @import "tailwindcss";';
        }
        throw new Error("unreadable");
      },
      resolve: async (specifier) => {
        if (specifier === "unreadable.css") return "/app/unreadable.css";
        if (specifier === "tailwindcss") return "/app/node_modules/tailwindcss/dist/lib.js";
        return null;
      },
    });

    expect(graph.unresolved).toEqual([{ importer: "/app/styles.css", specifier: "missing.css" }]);
    expect(graph.unreadable).toEqual(["/app/unreadable.css"]);
    expect([...graph.files.keys()]).toEqual(["/app/styles.css"]);
  });
});
