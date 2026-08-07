import { describe, expect, it } from "vitest";
import * as publicInventoryApi from "./index.ts";
import { createTokenInventory } from "./inventory.ts";
import type { StylesheetArtifact } from "./types.ts";

function artifact(overrides: Partial<StylesheetArtifact> & Pick<StylesheetArtifact, "id">): StylesheetArtifact {
  return {
    buildTool: "vite",
    stage: "authored",
    provenance: "project",
    ...overrides,
  };
}

describe("token inventory contract", () => {
  it("keeps parsing and policy helpers behind the public inventory Interface", () => {
    expect(Object.keys(publicInventoryApi).sort()).toEqual([
      "createTokenInventory",
      "parseTokenCatalog",
      "parseTokens",
    ]);
  });

  it("creates an artifact and returns grouped definitions with deterministic declaration ids", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "src/theme.css",
      order: 1,
      content: ":root {\n  --color-surface: #fff;\n}",
    }));

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions).toHaveLength(1);
    const definition = snapshot.definitions[0]!;
    expect(definition).toMatchObject({ cssName: "--color-surface", name: "--color-surface" });
    expect(definition.declarations).toHaveLength(1);
    // id = artifact identity + cssName + source(artifact:line) + context + local order
    expect(definition.declarations[0]!.id).toBe(
      `vite\u0000src/theme.css\u0000authored\u0000--color-surface\u0000src/theme.css:2\u0000{"selector":":root"}\u00000`,
    );
    expect(definition.declarations[0]!.order).toBe(0);
    expect(definition.declarations[0]!.value).toBe("#fff");
  });

  it("orders artifacts by supplied order before id-based discovery order", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "a.css", order: 2, content: ":root { --from-a: 1px; }" }));
    inventory.apply(artifact({ id: "b.css", order: 1, content: ":root { --from-b: 2px; }" }));
    inventory.apply(artifact({ id: "z.css", content: ":root { --from-z: 3px; }" }));
    inventory.apply(artifact({ id: "c.css", content: ":root { --from-c: 4px; }" }));

    expect(inventory.snapshot().definitions.map((definition) => definition.cssName))
      .toEqual(["--from-b", "--from-a", "--from-c", "--from-z"]);
  });

  it("replaces rows when the same artifact id is updated, without duplicates", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 2px; }" }));

    const definition = inventory.snapshot().definitions[0]!;
    expect(definition.declarations).toHaveLength(1);
    expect(definition.declarations[0]!.value).toBe("2px");
  });

  it("removes rows when an artifact is applied without content", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    expect(inventory.snapshot().definitions).toHaveLength(1);

    inventory.apply(artifact({ id: "s.css" }));
    expect(inventory.snapshot().definitions).toEqual([]);
    expect(inventory.snapshot().tokens).toEqual([]);
  });

  it("feeds equivalent facts in different event batches into identical snapshots", () => {
    const build = (order: Array<[string, number]>) => {
      const inventory = createTokenInventory();
      for (const [id, rank] of order) {
        inventory.apply(artifact({ id, order: rank, content: `:root { --${id}: 1px; }` }));
      }
      return inventory.snapshot();
    };
    expect(build([["a.css", 1], ["b.css", 2], ["c.css", 3]]))
      .toEqual(build([["c.css", 3], ["a.css", 1], ["b.css", 2]]));
  });

  it("merges duplicate declarations across artifacts under one definition in deterministic order", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "base.css", order: 1, content: ":root { --surface: white; }" }));
    inventory.apply(artifact({
      id: "dark.css",
      order: 2,
      content: `:root[data-theme="dark"] { --surface: #111 !important; }`,
    }));

    const definition = inventory.snapshot().definitions.find((entry) => entry.cssName === "--surface")!;
    expect(definition.declarations.map((declaration) => declaration.value)).toEqual(["white", "#111"]);
    expect(definition.declarations[0]!.context).toEqual({ selector: ":root" });
    expect(definition.declarations[1]!.context).toEqual({ selector: ':root[data-theme="dark"]' });
    expect(definition.declarations[1]!.important).toBe(true);
    // global positional order follows artifact order then local source order
    expect(definition.declarations.map((declaration) => declaration.order)).toEqual([0, 1]);
    expect(definition.declarations[0]!.id).not.toBe(definition.declarations[1]!.id);
  });

  it("assigns global declaration order from source order before grouping duplicate names", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "source-order.css",
      content: ":root { --a: 1px; --b: 2px; --a: 3px; }",
    }));

    const snapshot = inventory.snapshot();
    const a = snapshot.definitions.find((definition) => definition.cssName === "--a")!;
    const b = snapshot.definitions.find((definition) => definition.cssName === "--b")!;
    expect(a.declarations.map((declaration) => declaration.order)).toEqual([0, 2]);
    expect(b.declarations.map((declaration) => declaration.order)).toEqual([1]);
  });

  it("uses build tool and stage in artifact identity and removes only the matching observation", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "theme.css", buildTool: "vite", stage: "authored", content: ":root { --vite-authored: 1px; }" }));
    inventory.apply(artifact({ id: "theme.css", buildTool: "vite", stage: "transformed", content: ":root { --vite-transformed: 2px; }" }));
    inventory.apply(artifact({ id: "theme.css", buildTool: "webpack", stage: "authored", content: ":root { --webpack-authored: 3px; }" }));

    expect(inventory.snapshot().definitions.map((definition) => definition.cssName).sort())
      .toEqual(["--vite-authored", "--vite-transformed", "--webpack-authored"]);

    inventory.apply(artifact({ id: "theme.css", buildTool: "vite", stage: "authored" }));
    expect(inventory.snapshot().definitions.map((definition) => definition.cssName).sort())
      .toEqual(["--vite-transformed", "--webpack-authored"]);
  });

  it("retains per-declaration provenance and whether ordering evidence is authoritative", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "package.css",
      provenance: "package",
      order: 1,
      content: ":root { --shared: package; }",
    }));
    inventory.apply(artifact({
      id: "project.css",
      provenance: "project",
      discoveryOrder: 4,
      content: ":root { --shared: project; }",
    }));

    const declarations = inventory.snapshot().definitions[0]!.declarations;
    expect(declarations[0]!.contribution).toMatchObject({
      kind: "stylesheet",
      provenance: "package",
      editable: false,
      orderEvidence: { kind: "stylesheet", index: 1 },
    });
    expect(declarations[1]!.contribution).toMatchObject({
      kind: "stylesheet",
      provenance: "project",
      editable: true,
      orderEvidence: { kind: "discovery", index: 4 },
    });
  });

  it("retains caller-contributed artifact and Adapter diagnostics alongside valid knowledge", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "good.css", content: ":root { --good: 1px; }" }));
    inventory.apply(artifact({
      id: "missing.css",
      diagnostics: [{ code: "stylesheet-unreadable", message: "permission denied" }],
    }));
    inventory.setAdapterContributions({
      tokens: [],
      diagnostics: [{
        code: "vanilla-extract-contract-unsupported-shape",
        message: "unsupported contract",
        module: "theme.css.ts",
        exportName: "theme",
      }],
    });

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.map((definition) => definition.cssName)).toEqual(["--good"]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({ code: "stylesheet-unreadable", artifact: "missing.css" }),
      expect.objectContaining({
        code: "vanilla-extract-contract-unsupported-shape",
        module: "theme.css.ts",
        exportName: "theme",
      }),
    ]);
  });

  it("preserves provenance and editability per artifact", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "node_modules/@acme/theme/index.css",
      provenance: "package",
      content: ":root { --pkg: 1px; }",
    }));
    inventory.apply(artifact({ id: "src/local.css", content: ":root { --local: 2px; }" }));

    const snapshot = inventory.snapshot();
    const pkg = snapshot.definitions.find((entry) => entry.cssName === "--pkg")!;
    const local = snapshot.definitions.find((entry) => entry.cssName === "--local")!;
    expect(pkg.origin).toBe("package");
    expect(pkg.editable).toBe(false);
    expect(local.origin).toBe("project");
    expect(local.editable).toBeUndefined();
  });

  it("merges Adapter literal tokens with their provenance", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "src/theme.css", content: ":root { --from-css: 1px; }" }));
    inventory.setAdapterContributions({
      tokens: [
        { name: "primary", cssName: "--tw-primary", value: "#3b82f6", source: "tailwind.config", adapter: "tailwind-v3", origin: "framework", editable: false },
      ],
    });

    const snapshot = inventory.snapshot();
    const adapter = snapshot.definitions.find((entry) => entry.cssName === "--tw-primary")!;
    expect(adapter.name).toBe("primary");
    expect(adapter.origin).toBe("framework");
    expect(adapter.editable).toBe(false);
    expect(adapter.adapter).toBe("tailwind-v3");
    expect(adapter.declarations).toHaveLength(1);
    expect(adapter.declarations[0]!.value).toBe("#3b82f6");
    expect(adapter.declarations[0]!.important).toBe(false);

    const projected = snapshot.tokens.find((entry) => entry.cssName === "--tw-primary")!;
    expect(projected).toMatchObject({
      name: "primary",
      cssName: "--tw-primary",
      value: "#3b82f6",
      origin: "framework",
      editable: false,
    });
  });

  it("reports malformed CSS as a diagnostic plus an empty contribution", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "broken.css", content: ":root { --x: red;" }));

    const snapshot = inventory.snapshot();
    expect(snapshot.diagnostics).toEqual([{
      code: "stylesheet-parse-failed",
      artifact: "broken.css",
      message: expect.stringContaining("broken.css"),
    }]);
    expect(snapshot.definitions).toEqual([]);
    expect(snapshot.tokens).toEqual([]);
    expect(typeof snapshot.generation).toBe("string");
  });

  it("keeps valid artifacts visible alongside a failed one", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "good.css", order: 1, content: ":root { --good: 1px; }" }));
    inventory.apply(artifact({ id: "broken.css", order: 2, content: ":root { --x: red;" }));

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.map((definition) => definition.cssName)).toEqual(["--good"]);
    expect(snapshot.diagnostics).toHaveLength(1);
  });

  it("keeps generation stable for no-op updates and changes it when facts change", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const first = inventory.snapshot().generation;
    expect(first).toBeTruthy();

    // identical re-apply is a no-op
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    expect(inventory.snapshot().generation).toBe(first);

    // a second snapshot without mutations does not recompute
    expect(inventory.snapshot().generation).toBe(first);

    // observable content change bumps the generation
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 2px; }" }));
    expect(inventory.snapshot().generation).not.toBe(first);

    const second = inventory.snapshot().generation;
    inventory.setAdapterContributions({ tokens: [{ name: "--y", value: "3px", source: "adapter" }] });
    expect(inventory.snapshot().generation).not.toBe(second);

    const third = inventory.snapshot().generation;
    inventory.setAdapterContributions({ tokens: [{ name: "--y", value: "3px", source: "adapter" }] });
    expect(inventory.snapshot().generation).toBe(third);

    // removal changes observable facts
    inventory.apply(artifact({ id: "s.css" }));
    expect(inventory.snapshot().generation).not.toBe(third);
  });

  it("exposes an immutable snapshot", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const snapshot = inventory.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions)).toBe(true);
    expect(() => { (snapshot.definitions as unknown[]).push({}); }).toThrow();
  });

  it("does not mutate parsed definitions between snapshots", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const first = inventory.snapshot();
    inventory.apply(artifact({ id: "other.css", content: ":root { --y: 2px; }" }));
    const second = inventory.snapshot();
    expect(first.definitions).toHaveLength(1);
    expect(second.definitions).toHaveLength(2);
    expect(first).not.toBe(second);
  });
});
