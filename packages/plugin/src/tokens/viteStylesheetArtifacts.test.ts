import { describe, expect, it } from "vitest";
import {
  createViteStylesheetArtifact,
  isHostApplicationSource,
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

  it("admits explicitly scoped workspace sources while keeping dependencies and output closed", () => {
    const root = "/repo/apps/web";
    const workspaceRoot = "/repo/packages/ui";

    expect(isHostApplicationSource(
      "/repo/packages/ui/src/Button.tsx",
      root,
      { sourceRoots: ["../../packages/ui"] },
    )).toBe(true);
    expect(isHostApplicationSource(
      "/repo/packages/ui/node_modules/@acme/Button.tsx",
      root,
      { sourceRoots: ["../../packages/ui"] },
    )).toBe(false);
    expect(isHostApplicationSource(
      `${workspaceRoot}/dist/Button.js`,
      root,
      { sourceRoots: [workspaceRoot] },
    )).toBe(false);
    expect(isHostApplicationSource(
      "/repo/packages/other/src/Button.tsx",
      root,
      { sourceRoots: [workspaceRoot] },
    )).toBe(false);
  });

  it("labels scoped workspace CSS as project provenance with a stable source", () => {
    expect(createViteStylesheetArtifact({
      id: "/repo/packages/ui/src/theme.css",
      projectRoot: "/repo/apps/web",
      sourceRoots: ["../../packages/ui"],
      stage: "authored",
      content: ":root { --color-brand: red; }",
    })).toMatchObject({
      id: "src/theme.css",
      provenance: "project",
    });
  });
});
