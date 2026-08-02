// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { TokenDefinition } from "virtual:design-tokens";
import { clearChanges } from "./changesLog.ts";
import { inspectElement, installInspectionBridge } from "./inspection.ts";

const catalog: TokenDefinition[] = [
  {
    name: "theme.color.brand",
    cssName: "--color-brand__compiled",
    adapter: "vanilla-extract",
    origin: "project",
    editable: true,
    declarations: [{
      value: "#123456",
      source: "src/theme.css.ts",
      important: false,
      context: { selector: ":root" },
    }],
  },
  {
    name: "theme.color.accent",
    cssName: "--color-accent__compiled",
    adapter: "vanilla-extract",
    origin: "project",
    editable: true,
    declarations: [{
      value: "#abcdef",
      source: "src/theme.css.ts",
      important: false,
      context: { selector: ":root" },
    }],
  },
];

afterEach(() => {
  clearChanges();
  delete window.__designTool;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function mount(): HTMLElement {
  document.head.innerHTML = `<style>
    .theme { --color-brand__compiled: #123456; --color-accent__compiled: #abcdef; }
    .card { color: var(--color-brand__compiled); }
  </style>`;
  document.body.innerHTML = '<article class="card theme" data-cid="Card" data-src="src/Card.tsx:4:3"></article>';
  return document.querySelector<HTMLElement>(".card")!;
}

describe("structured inspection contract", () => {
  it("reports catalog, authored attribution, projection, and UI suggestions together", () => {
    const inspection = inspectElement(mount(), {
      catalog,
      tokens: catalog.map((definition) => ({
        name: definition.name,
        cssName: definition.cssName,
        value: definition.declarations[0]!.value,
        source: definition.declarations[0]!.source,
        adapter: definition.adapter,
        origin: definition.origin,
        editable: definition.editable,
      })),
    });

    expect(inspection.identity).toMatchObject({ cid: "Card", file: "src/Card.tsx", line: 4 });
    expect(inspection.catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.color.brand", cssName: "--color-brand__compiled" }),
    ]));
    expect(inspection.properties.find((row) => row.property === "color")).toMatchObject({
      authored: "var(--color-brand__compiled)",
      tokenName: "theme.color.brand",
      capability: "color",
    });
    expect(inspection.controls.find((control) => control.property === "color")).toEqual({
      property: "color",
      kind: "token",
      activeToken: "theme.color.brand",
      suggestions: ["theme.color.brand", "theme.color.accent"],
    });
    expect(inspection.managedPreview).toEqual({ rules: [], results: [] });
    expect(inspection.prompt).toBeNull();
  });

  it("installs an idempotently removable selector bridge", () => {
    mount();
    const remove = installInspectionBridge();

    expect(window.__designTool?.version).toBe(1);
    expect(window.__designTool?.inspect(".card")?.identity.cid).toBe("Card");
    expect(window.__designTool?.inspect(".missing")).toBeNull();

    remove();
    expect(window.__designTool).toBeUndefined();
  });
});
