import { describe, expect, it } from "vitest";
import {
  createViteStylesheetArtifact,
  orderViteStylesheetGraph,
} from "./viteStylesheetArtifacts.ts";

describe("Vite stylesheet artifact adapter", () => {
  it("normalizes project/package provenance and Tailwind labels", () => {
    expect(createViteStylesheetArtifact({
      id: "/app/src/theme.css?direct",
      projectRoot: "/app",
      stage: "authored",
      content: "@theme { --color-brand: red; }",
    })).toMatchObject({
      id: "src/theme.css",
      provenance: "project",
      adapter: "tailwind-v4",
    });
    expect(createViteStylesheetArtifact({
      id: "/app/node_modules/@acme/theme.css",
      projectRoot: "/app",
      stage: "authored",
    })).toMatchObject({ id: "@acme/theme.css", provenance: "package" });
  });

  it("uses authoritative order for one root and discovery evidence for many", () => {
    const graph = {
      files: new Map([["nested.css", "a{}"], ["root.css", "b{}"]]),
      order: ["nested.css", "root.css"],
      unresolved: [],
      unreadable: [],
    };
    expect(orderViteStylesheetGraph(graph, 1)).toEqual([
      { id: "nested.css", code: "a{}", order: 0 },
      { id: "root.css", code: "b{}", order: 1 },
    ]);
    expect(orderViteStylesheetGraph(graph, 2)).toEqual([
      { id: "nested.css", code: "a{}", discoveryOrder: 0 },
      { id: "root.css", code: "b{}", discoveryOrder: 1 },
    ]);
  });
});
