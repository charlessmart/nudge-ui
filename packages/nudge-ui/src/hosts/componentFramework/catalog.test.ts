import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { createComponentCatalog } from "./catalog.ts";
import { reactComponentFramework } from "./react.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function catalogFor(root: string) {
  return createComponentCatalog(reactComponentFramework, {
    root: () => root,
    isHostSource: (file) => !relative(root, file).startsWith(".."),
    catalogPath: (file) => relative(root, file),
    warn: () => undefined,
  }, { typeAware: false });
}

const BUTTON = 'export function Button({ tone }: { tone?: "primary" | "quiet" }) {\n  return <button data-tone={tone} />;\n}\n';

describe("createComponentCatalog", () => {
  it("reads every adapter source under the root and skips dependency and Nudge folders", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-"));
    roots.push(root);
    write(root, "src/Button.tsx", BUTTON);
    write(root, "node_modules/pkg/Button.tsx", BUTTON);
    write(root, ".nudge/next/Button.tsx", BUTTON);
    const catalog = catalogFor(root);
    catalog.warmUp();
    expect(catalog.contracts().map((contract) => contract.componentId)).toEqual(["src/Button#Button"]);
  });

  it("forgets sources a rescan no longer finds", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-rescan-"));
    roots.push(root);
    write(root, "src/a/Button.tsx", BUTTON);
    write(root, "src/b/Chip.tsx", BUTTON.replaceAll("Button", "Chip"));
    const catalog = catalogFor(root);
    catalog.warmUp();
    expect(catalog.contracts()).toHaveLength(2);

    rmSync(join(root, "src/a"), { recursive: true });
    catalog.rescan();
    expect(catalog.contracts().map((contract) => contract.componentId)).toEqual(["src/b/Chip#Chip"]);
  });

  it("keeps hand-written metadata ahead of what package types say", () => {
    const root = mkdtempSync(join(tmpdir(), "catalog-metadata-"));
    roots.push(root);
    const catalog = createComponentCatalog(reactComponentFramework, {
      root: () => root,
      isHostSource: () => true,
      catalogPath: (file) => relative(root, file),
      warn: () => undefined,
    }, {
      typeAware: false,
      componentMetadata: [{ componentId: "@ui/kit#Chip", name: "Chip", file: "@ui/kit", props: [], provenance: "typescript" }],
    });
    expect(catalog.contracts()).toEqual([
      { componentId: "@ui/kit#Chip", name: "Chip", file: "@ui/kit", props: [], provenance: "package-manifest" },
    ]);
  });
});
