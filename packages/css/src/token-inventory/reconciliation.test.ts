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

describe("token inventory authored/transformed reconciliation", () => {
  it("lets the transformed observation win while authored names keep project provenance", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "theme.css",
      content: ":root {\n  --brand: #123456;\n}",
    }));
    inventory.apply(artifact({
      id: "theme.css",
      stage: "transformed",
      content: ":root {\n  --brand: #abcdef;\n  --compiler-added: 4px;\n}",
    }));

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions).toHaveLength(2);

    const brand = snapshot.definitions.find((definition) => definition.cssName === "--brand")!;
    // Browser-relevant facts come from the transformed observation only.
    expect(brand.declarations).toHaveLength(1);
    expect(brand.declarations[0]!.value).toBe("#abcdef");
    // The name is authored in the same artifact, so provenance stays project.
    expect(brand.origin).toBe("project");

    const added = snapshot.definitions.find((definition) => definition.cssName === "--compiler-added")!;
    expect(added.origin).toBe("generated");
    expect(added.editable).toBe(false);
    expect(added.declarations[0]!.value).toBe("4px");
  });

  it("treats a transform-only name as generated and non-editable", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --authored: 1px; }" }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --authored: 1px; --only-emitted: 2px; }",
    }));

    const snapshot = inventory.snapshot();
    const authored = snapshot.definitions.find((definition) => definition.cssName === "--authored")!;
    const emitted = snapshot.definitions.find((definition) => definition.cssName === "--only-emitted")!;
    expect(authored.origin).toBe("project");
    expect(emitted.origin).toBe("generated");
    expect(emitted.editable).toBe(false);
    expect(snapshot.tokens.find((token) => token.cssName === "--only-emitted"))
      .toMatchObject({ origin: "generated", editable: false });
  });

  it("uses authored declarations when no transform has been observed yet", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));

    const snapshot = inventory.snapshot();
    const x = snapshot.definitions.find((definition) => definition.cssName === "--x")!;
    expect(x.declarations).toHaveLength(1);
    expect(x.declarations[0]!.value).toBe("1px");
    expect(x.origin).toBe("project");
    expect(x.editable).toBeUndefined();
  });

  it("keeps artifact provenance when only the transformed observation exists", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      provenance: "package",
      content: ":root { --from-package: 2px; }",
    }));

    const snapshot = inventory.snapshot();
    const row = snapshot.definitions.find((definition) => definition.cssName === "--from-package")!;
    // No authored counterpart exists, so nothing is labelled generated: the
    // plain-CSS/package post-transform-only case keeps its package provenance.
    expect(row.origin).toBe("package");
    expect(row.editable).toBe(false);
    expect(row.declarations[0]!.value).toBe("2px");
  });

  it("replaces a repeated transformed observation without duplicating declarations", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --x: 2px; --y: 3px; }",
    }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --x: 4px; }",
    }));

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.map((definition) => definition.cssName)).toEqual(["--x"]);
    const x = snapshot.definitions[0]!;
    expect(x.declarations).toHaveLength(1);
    expect(x.declarations[0]!.value).toBe("4px");
  });

  it("preserves stable declaration identity when the transform replaces an authored row for the same cssName", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const authoredId = inventory.snapshot().definitions[0]!.declarations[0]!.id;

    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      // Same line position as the authored observation.
      content: ":root { --x: 2px; }",
    }));
    const transformedId = inventory.snapshot().definitions[0]!.declarations[0]!.id;
    expect(transformedId).toBe(authoredId);
  });

  it("removal clears both authored and transformed observations", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.apply(artifact({ id: "s.css", stage: "transformed", content: ":root { --x: 2px; }" }));
    expect(inventory.snapshot().definitions).toHaveLength(1);

    inventory.apply(artifact({ id: "s.css" }));
    const snapshot = inventory.snapshot();
    expect(snapshot.definitions).toEqual([]);
    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("retains the authored inventory and records a recoverable diagnostic on a failed transform", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --x: 2px; }",
    }));
    const before = inventory.snapshot().generation;

    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      failed: true,
      provenance: "project",
    }));

    const failed = inventory.snapshot();
    expect(failed.diagnostics).toEqual([expect.objectContaining({
      code: "transform-observation-failed",
      artifact: "s.css",
    })]);
    // The browser-relevant facts fall back to the last valid authored row.
    const x = failed.definitions.find((definition) => definition.cssName === "--x")!;
    expect(x.declarations[0]!.value).toBe("1px");
    expect(failed.generation).not.toBe(before);
  });

  it("clears the failed-transform diagnostic and restores the generation on recovery", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --x: 2px; }",
    }));
    const healthy = inventory.snapshot().generation;

    inventory.apply(artifact({ id: "s.css", stage: "transformed", failed: true, provenance: "project" }));
    inventory.apply(artifact({
      id: "s.css",
      stage: "transformed",
      content: ":root { --x: 2px; }",
    }));

    const recovered = inventory.snapshot();
    expect(recovered.diagnostics).toEqual([]);
    expect(recovered.definitions[0]!.declarations[0]!.value).toBe("2px");
    // The observable facts are identical to the pre-failure state, so the
    // failed marker -> recovery transition does not double-bump the generation.
    expect(recovered.generation).toBe(healthy);
  });

  it("feeds the same facts in different orders into identical snapshots and generations", () => {
    const build = (order: StylesheetArtifact[][]) => {
      const inventory = createTokenInventory();
      for (const batch of order) {
        for (const artifactRow of batch) inventory.apply(artifactRow);
      }
      return inventory.snapshot();
    };
    const authoredFirst = build([
      [artifact({ id: "a.css", order: 1, content: ":root { --a: 1px; }" })],
      [artifact({ id: "a.css", order: 1, stage: "transformed", content: ":root { --a: 2px; --emitted: 9px; }" })],
      [artifact({ id: "b.css", order: 2, content: ":root { --b: 3px; }" })],
    ]);
    const transformFirst = build([
      [artifact({ id: "a.css", order: 1, stage: "transformed", content: ":root { --a: 2px; --emitted: 9px; }" })],
      [artifact({ id: "b.css", order: 2, content: ":root { --b: 3px; }" })],
      [artifact({ id: "a.css", order: 1, content: ":root { --a: 1px; }" })],
    ]);
    expect(transformFirst).toEqual(authoredFirst);
  });

  it("changes the generation exactly when observable facts change across reconciliations", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({ id: "s.css", content: ":root { --x: 1px; }" }));
    const g1 = inventory.snapshot().generation;

    // Adding a transformed observation that changes the winning value bumps.
    inventory.apply(artifact({ id: "s.css", stage: "transformed", content: ":root { --x: 2px; }" }));
    const g2 = inventory.snapshot().generation;
    expect(g2).not.toBe(g1);

    // Re-applying the identical transformed observation is a no-op.
    inventory.apply(artifact({ id: "s.css", stage: "transformed", content: ":root { --x: 2px; }" }));
    expect(inventory.snapshot().generation).toBe(g2);

    // A transform that emits a new name changes observable facts.
    inventory.apply(artifact({ id: "s.css", stage: "transformed", content: ":root { --x: 2px; --new: 5px; }" }));
    const g3 = inventory.snapshot().generation;
    expect(g3).not.toBe(g2);
    expect(inventory.snapshot().definitions.find((definition) => definition.cssName === "--new"))
      .toMatchObject({ origin: "generated", editable: false });
  });

  it("propagates the artifact adapter label onto reconciled non-package rows", () => {
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

    const snapshot = inventory.snapshot();
    expect(snapshot.definitions.find((definition) => definition.cssName === "--brand"))
      .toMatchObject({ adapter: "tailwind-v4", origin: "project" });
    expect(snapshot.definitions.find((definition) => definition.cssName === "--emitted"))
      .toMatchObject({ adapter: "tailwind-v4", origin: "generated", editable: false });
  });

  it("leaves package provenance untouched even when an adapter label is present", () => {
    const inventory = createTokenInventory();
    inventory.apply(artifact({
      id: "node_modules/@acme/theme/index.css",
      provenance: "package",
      adapter: "tailwind-v4",
      content: ":root { --pkg: 1px; }",
    }));

    const snapshot = inventory.snapshot();
    const row = snapshot.definitions.find((definition) => definition.cssName === "--pkg")!;
    expect(row.origin).toBe("package");
    expect(row.editable).toBe(false);
    expect(row.adapter).toBeUndefined();
  });
});
