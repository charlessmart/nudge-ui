// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTokenInventory } from "../../css/token-inventory/index.ts";
import type { TokenDefinition, TokenEntry } from "../../css/model/index.ts";
import { applyRules, verifyPreview } from "../projection/managedStylesheet.ts";
import { generatePrompt } from "../prompt/generatePrompt.ts";
import type { ElementChangeRecord } from "../changes/changesLog.ts";
import { createBrowserCssInspection } from "./browserCssInspection.ts";

const TRACER_CSS = `:root {
  --space-tracer: 24px;
  --color-tracer: #123456;
}

.subject {
  color: var(--color-tracer);
  padding: var(--space-tracer);
}`;

const MARKUP =
  '<div class="subject" data-cid="TracerCase" data-src="tracer.tsx:1:1">Tracer</div>';

/**
 * Mirrors the plugin's `load()` serialization for `virtual:design-tokens`
 * (S2-B slice 2.3): the inventory snapshot is published without rebuilding
 * declaration identities or order, and `tokenGeneration` carries the snapshot
 * fingerprint.
 */
function serializeTransport(
  definitions: readonly unknown[],
  generation: string,
): string {
  return [
    `export const tokenCatalog = ${JSON.stringify([...definitions])};`,
    `export const tokenDiagnostics = ${JSON.stringify([])};`,
    `export const tokenGeneration = ${JSON.stringify(generation)};`,
    `export const nudgeUiProjectId = "tracer";`,
  ].join("\n");
}

function extract(code: string, name: string): string {
  return new RegExp(`^export const ${name} = (.*);$`, "m").exec(code)?.[1] ?? "undefined";
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("plain-CSS token inventory tracer bullet", () => {
  it("carries a plain-CSS token from inventory through transport into browser inspection, managed preview, and prompt", () => {
    // 1. Inventory: feed the artifact exactly as the Vite adapter does.
    const inventory = createTokenInventory();
    inventory.apply({
      buildTool: "vite",
      id: "src/tracer.css",
      stage: "authored",
      provenance: "project",
      content: TRACER_CSS,
    });
    const snapshot = inventory.snapshot();

    // 2. Transport: serialize the snapshot the way the plugin's load() does
    //    and read tokenCatalog/tokenGeneration back out of the module text.
    const module = serializeTransport(snapshot.definitions, snapshot.generation);
    const tokenCatalog = JSON.parse(extract(module, "tokenCatalog")) as TokenDefinition[];
    const tokenGeneration = JSON.parse(extract(module, "tokenGeneration")) as string;
    expect(tokenCatalog.find((definition) => definition.cssName === "--color-tracer"))
      .toMatchObject({ origin: "project" });
    expect(tokenGeneration).toMatch(/^g[0-9a-f]+$/);

    // 3. Browser CSS inspection: mount the same CSS and markup, then attribute
    //    the transported token to the painted property.
    const style = document.createElement("style");
    style.textContent = TRACER_CSS;
    document.head.appendChild(style);
    const mount = document.createElement("div");
    mount.innerHTML = MARKUP;
    document.body.appendChild(mount);
    const selected = mount.querySelector<HTMLElement>(".subject");
    if (!selected) throw new Error("tracer fixture mounted no .subject");

    const inspection = createBrowserCssInspection({
      document,
      tokenKnowledge: { definitions: tokenCatalog, generation: tokenGeneration },
    });
    const properties = inspection.inspect(selected).properties;
    const color = properties.find((property) => property.property === "color");
    expect(color?.authored).toBe("var(--color-tracer)");
    expect(color?.tokens?.map((token) => token.name)).toContain("--color-tracer");
    expect(color?.capability).toBe("color");
    const padding = properties.find((property) => property.property === "padding-top");
    expect(padding?.authored).toBe("var(--space-tracer)");
    expect(padding?.tokens?.map((token) => token.name)).toContain("--space-tracer");

    // 4. Managed preview: project a value through the managed stylesheet.
    applyRules([{ selector: ".subject", declarations: { color: "#abcdef" } }]);
    const preview = verifyPreview(selected, "color", "#abcdef");
    expect(preview.status).toBe("applied");

    // 5. Prompt: a change built from the transported token is referenced.
    const token: TokenEntry = {
      name: "--color-tracer",
      cssName: "--color-tracer",
      value: "#123456",
      source: "src/tracer.css:3",
    };
    const change: ElementChangeRecord = {
      cid: "TracerCase",
      file: "src/TracerCase.tsx",
      line: 1,
      selector: '[data-cid="TracerCase"]',
      property: "color",
      oldToken: null,
      newToken: token,
      source: { file: "src/TracerCase.tsx", line: 1, component: "TracerCase" },
    };
    const prompt = generatePrompt([change]);
    expect(prompt).toContain("var(--color-tracer)");

    inspection.dispose();
  });

  it("changes the generation exactly when the observable artifact content changes", () => {
    const inventory = createTokenInventory();
    inventory.apply({
      buildTool: "vite",
      id: "src/tracer.css",
      stage: "authored",
      provenance: "project",
      content: TRACER_CSS,
    });
    const first = inventory.snapshot();
    inventory.apply({
      buildTool: "vite",
      id: "src/tracer.css",
      stage: "authored",
      provenance: "project",
      content: ":root { --color-tracer: #abcdef; }",
    });
    const second = inventory.snapshot();
    expect(second.generation).not.toBe(first.generation);
  });
});
