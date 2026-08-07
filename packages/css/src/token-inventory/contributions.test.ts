import { describe, expect, it } from "vitest";
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

describe("token inventory normalized contributions", () => {
  it("merges literal contribution tokens with same-key replacement semantics", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "src/theme.css", content: ":root { --tw-primary: #000; }" }));
    inventory.applyContribution({
      id: "tailwind-v3",
      tokens: [{ name: "primary", cssName: "--tw-primary", value: "#3b82f6", source: "tailwind.config.js", adapter: "tailwind-v3", origin: "project", editable: true }],
    });

    const definition = inventory.snapshot().definitions.find((entry) => entry.cssName === "--tw-primary")!;
    // The literal replaces the stylesheet row for the same key, not appends.
    expect(definition).toMatchObject({ name: "primary", adapter: "tailwind-v3", origin: "project", editable: true });
    expect(definition.declarations).toHaveLength(1);
    expect(definition.declarations[0]!.value).toBe("#3b82f6");
  });

  it("replaces a contribution by id so repeated applications never duplicate rows", () => {
    const inventory = createTokenInventory();
    inventory.applyContribution({
      id: "literal",
      tokens: [{ name: "--a", value: "1px", source: "adapter" }],
    });
    inventory.applyContribution({
      id: "literal",
      tokens: [{ name: "--a", value: "2px", source: "adapter" }],
    });

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions).toHaveLength(1);
    expect(snapshot.definitions[0]!.declarations).toHaveLength(1);
    expect(snapshot.definitions[0]!.declarations[0]!.value).toBe("2px");
  });

  it("appends contributed declarations to an existing definition and enriches labels", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "src/theme.css", content: ":root { --x: 1px; }" }));
    inventory.applyContribution({
      id: "enrich",
      definitions: [{
        cssName: "--x",
        name: "theme.x",
        adapter: "vanilla-extract",
        origin: "package",
        editable: false,
        declarations: [{ value: "2px", source: "contract", important: false, context: {} }],
      }],
    });

    const definition = inventory.snapshot().definitions.find((entry) => entry.cssName === "--x")!;
    // Definition-level merge appends declarations...
    expect(definition.declarations.map((declaration) => declaration.value)).toEqual(["1px", "2px"]);
    expect(definition.declarations[0]!.source).toBe("src/theme.css:1");
    // ...`name`/`adapter` win, while the stylesheet-derived origin is
    // preserved. A project CSS row has no editability of its own, so the
    // contributed editability applies (matching enrichVanillaExtractCatalog).
    expect(definition).toMatchObject({
      name: "theme.x",
      adapter: "vanilla-extract",
      origin: "project",
      editable: false,
    });
  });

  it("uses the contributed origin/editability only when the stylesheet definition has none", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "node_modules/@acme/theme/index.css",
      provenance: "package",
      content: ":root { --pkg: 1px; }",
    }));
    inventory.applyContribution({
      id: "enrich",
      definitions: [{
        cssName: "--pkg",
        name: "theme.pkg",
        adapter: "vanilla-extract",
        origin: "project",
        editable: true,
        declarations: [],
      }],
    });

    const definition = inventory.snapshot().definitions.find((entry) => entry.cssName === "--pkg")!;
    expect(definition).toMatchObject({ origin: "package", editable: false, name: "theme.pkg", adapter: "vanilla-extract" });
  });

  it("ignores a contributed definition with no matching cssName", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "src/theme.css", content: ":root { --x: 1px; }" }));
    inventory.applyContribution({
      id: "enrich",
      definitions: [{
        cssName: "--not-in-the-page",
        name: "theme.missing",
        adapter: "vanilla-extract",
        declarations: [],
      }],
    });

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.map((definition) => definition.cssName)).toEqual(["--x"]);
  });

  it("applies deterministic relabelling facts to every aggregated definition", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "theme.css",
      adapter: "tailwind-v4",
      content: ":root { --brand: #123456; }",
    }));
    inventory.apply(artifact({
      id: "theme.css",
      stage: "transformed",
      adapter: "tailwind-v4",
      content: ":root { --brand: #123456; --emitted: 4px; }",
    }));
    inventory.applyContribution({
      id: "tailwind-v4-naming",
      order: 0,
      relabellings: [
        { adapter: "tailwind-v4", fromOrigin: "project", origin: "project", editable: true },
        { adapter: "tailwind-v4", fromOrigin: "generated", origin: "framework", editable: false },
      ],
    });

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.find((definition) => definition.cssName === "--brand"))
      .toMatchObject({ origin: "project", editable: true });
    expect(snapshot.definitions.find((definition) => definition.cssName === "--emitted"))
      .toMatchObject({ origin: "framework", editable: false });
  });

  it("keeps the generation stable on identical re-apply and bumps it on a real change", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const contribution = {
      id: "enrich",
      definitions: [{ cssName: "--x", name: "theme.x", adapter: "vanilla-extract", declarations: [] }],
    };
    inventory.applyContribution(contribution);
    const first = inventory.snapshot().generation;
    expect(first).toBeTruthy();

    // Identical re-apply is a no-op.
    inventory.applyContribution(contribution);
    expect(inventory.snapshot().generation).toBe(first);

    // A real fact change bumps the generation.
    inventory.applyContribution({ ...contribution, definitions: [{ cssName: "--x", name: "theme.y", adapter: "vanilla-extract", declarations: [] }] });
    expect(inventory.snapshot().generation).not.toBe(first);
    expect(inventory.snapshot().definitions[0]!.name).toBe("theme.y");

    // A replacing contribution with different facts also bumps.
    const second = inventory.snapshot().generation;
    inventory.applyContribution({ ...contribution, tokens: [{ name: "--z", value: "9px", source: "adapter" }] });
    expect(inventory.snapshot().generation).not.toBe(second);
  });

  it("orders contributions deterministically regardless of application timing", () => {
    const build = (batch: boolean) => {
      const inventory = createTokenInventory();
      inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
      const first = { id: "first", order: 1, definitions: [{ cssName: "--x", name: "one", declarations: [] }] };
      const second = { id: "second", order: 2, definitions: [{ cssName: "--x", name: "two", declarations: [] }] };
      if (batch) {
        inventory.applyContribution(second);
        inventory.applyContribution(first);
      } else {
        inventory.applyContribution(first);
        inventory.applyContribution(second);
      }
      return inventory.snapshot();
    };
    // Later contributions win on the same key, so "two" is authoritative in
    // both orders and the snapshot (including the generation) is identical.
    expect(build(false)).toEqual(build(true));
    expect(build(false).definitions[0]!.name).toBe("two");
  });

  it("removes a contribution and every fact it merged", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.applyContribution({
      id: "enrich",
      definitions: [{ cssName: "--x", name: "theme.x", adapter: "vanilla-extract", declarations: [] }],
    });
    expect(inventory.snapshot().definitions[0]!.name).toBe("theme.x");

    inventory.removeContribution("enrich");
    const snapshot = inventory.snapshot();
    expect(snapshot.definitions[0]!.name).toBe("--x");
    expect(snapshot.definitions[0]!.adapter).toBeUndefined();
  });

  it("merges contribution diagnostics without hiding valid artifacts", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "good.css", order: 1, content: ":root { --good: 1px; }" }));
    inventory.applyContribution({
      id: "contract",
      diagnostics: [{
        code: "vanilla-extract-contract-unresolved",
        artifact: "@fixture/contract",
        message: "Could not resolve vanilla-extract contract module @fixture/contract.",
      }],
    });

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.map((definition) => definition.cssName)).toEqual(["--good"]);
    expect(snapshot.diagnostics).toEqual([{
      code: "vanilla-extract-contract-unresolved",
      artifact: "@fixture/contract",
      message: "Could not resolve vanilla-extract contract module @fixture/contract.",
    }]);
    // A removed contribution drops its diagnostics too.
    inventory.removeContribution("contract");
    expect(inventory.snapshot().diagnostics).toEqual([]);
  });

  it("exposes contributions through immutable snapshots", () => {
    const inventory = createTokenInventory();
    inventory.applyContribution({ id: "literal", tokens: [{ name: "--a", value: "1px", source: "adapter" }] });
    const snapshot = inventory.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions[0])).toBe(true);
  });
});
