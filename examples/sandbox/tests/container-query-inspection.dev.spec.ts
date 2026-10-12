import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { InspectionSnapshot } from "../../../packages/nudge-ui/src/inspector/inspection/browserCssInspection.ts";
import type { ContainerQueryEvaluator } from "../../../packages/nudge-ui/src/inspector/tokens/resolution/containerQueryEvaluator.ts";

declare global {
  interface Window {
    containerInspection: {
      createContainerQueryEvaluator(doc: Document): ContainerQueryEvaluator;
      refresh(elements: HTMLElement[]): { elements: readonly InspectionSnapshot[]; stableProperties: InspectionSnapshot["properties"] };
      readAuthoredStyleValue(element: HTMLElement, property: string): string | null;
      getStateStyleValue(element: HTMLElement, property: string): string;
    };
  }
}

let bundle: string;
test.beforeAll(async () => {
  const require = createRequire(new URL("../../../packages/nudge-ui/package.json", import.meta.url));
  const { build } = require("esbuild") as {
    build(options: unknown): Promise<{ outputFiles: Array<{ text: string }> }>;
  };
  const result = await build({
    stdin: {
      contents: `
        export { createContainerQueryEvaluator } from './tokens/resolution/containerQueryEvaluator.ts';
        export { readAuthoredStyleValue } from './styleEditors/layoutValue.ts';
        export { getStateStyleValue } from './shell/stateValue.ts';
        import { createBrowserCssInspection } from './inspection/browserCssInspection.ts';
        import { publishInspectionSnapshot } from './inspection/inspectionSnapshot.ts';
        import { enableInspectionPerformanceDiagnostics } from './inspection/performanceDiagnostics.ts';
        export function refresh(elements) {
          enableInspectionPerformanceDiagnostics(document);
          const session = createBrowserCssInspection({document, tokenKnowledge: {definitions: [], generation: 'test'}});
          try {
            const result = session.refresh(elements, 'base');
            result.elements.forEach((snapshot, i) => publishInspectionSnapshot(elements[i], snapshot));
            return result;
          } finally { session.dispose(); }
        }
      `,
      resolveDir: fileURLToPath(new URL("../../../packages/nudge-ui/src/inspector/", import.meta.url)),
      loader: "ts",
    },
    bundle: true, write: false, format: "iife", globalName: "containerInspection",
    platform: "browser", loader: { ".css": "text", ".svg": "dataurl" }, define: { "import.meta.env.DEV": "true" },
  });
  bundle = result.outputFiles[0]!.text;
});

test("nested conditions and ancestor queries do not leak between pairs", async ({ page }) => {
  await page.setContent(`
    <main style="container: outer / inline-size; width: 800px">
      <section id="parent" style="container: inner / inline-size; width: 200px">
        <div id="child"></div>
      </section>
    </main>
  `);
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const evaluator = window.containerInspection.createContainerQueryEvaluator(document);
    const parent = document.getElementById("parent")!;
    const child = document.getElementById("child")!;
    const size = ["(min-width: 500px)"];
    const nested = ["outer (min-width: 1000px)", "inner (min-width: 100px)"];
    evaluator.prefetch([{ element: parent, conditions: size }, { element: child, conditions: size }, { element: child, conditions: nested }]);
    return {
      parent: evaluator.matches(parent, size), child: evaluator.matches(child, size),
      nested: evaluator.matches(child, nested),
      cleaned: !document.querySelector('[data-nudge-ui="container-probe"]')
        && [parent, child].every((element) => element.getAttributeNames().every((name) => !name.startsWith("data-container-probe-"))),
    };
  });
  expect(result).toEqual({ parent: true, child: false, nested: false, cleaned: true });
});

test("one refresh shares a batch, skips irrelevant ancestors, and feeds controls", async ({ page }) => {
  await page.setContent(`
    <style>
      @container (min-width: 500px) {
        .parent { --space: 17px; }
        .missing { padding: 99px; }
      }
      @container (min-width: 1px) { .parent { padding: 99px; } }
      @container (min-width: 100px) { .child { width: 42px; } }
      .child { padding-left: var(--space); }
    </style>
    <main style="container-type: inline-size; width: 800px">
      <section class="parent" style="container-type: inline-size; width: 200px">
        <div class="child"></div><div class="child"></div>
      </section>
    </main>
  `);
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".child"));
    const { elements: snapshots, stableProperties } = window.containerInspection.refresh(elements);
    const before = window.__nudgeUiPerformance!.read();
    const widths = elements.map((element) => window.containerInspection.readAuthoredStyleValue(element, "width"));
    const padding = window.containerInspection.getStateStyleValue(elements[0]!, "padding-left");
    const after = window.__nudgeUiPerformance!.read();
    return {
      widths, padding, controlsDidNotInspect: JSON.stringify(before) === JSON.stringify(after),
      counts: before.idle, authored: snapshots[0]!.properties.find((row) => row.property === "width")?.authored,
      stable: stableProperties.find((row) => row.property === "width")?.authored,
      diagnostics: snapshots.flatMap((snapshot) => snapshot.diagnostics),
    };
  });
  expect(result).toMatchObject({
    widths: ["42px", "42px"], padding: "17px", controlsDidNotInspect: true,
    authored: "42px", stable: "42px", diagnostics: [],
    counts: { inspections: 3, probeBatches: 1, probePairs: 3 },
  });
});

for (const policy of ["default", "strict style-src"] as const) {
  test(`named container rules resolve under the ${policy} policy`, async ({ page }) => {
    await page.route("http://container.test/**", (route) => {
      if (route.request().url().endsWith("/cq.css")) {
        return route.fulfill({ contentType: "text/css", body: `
          .shell { container: card / inline-size; width: 480px; }
          @container card (min-width: 300px) { .cq-child { width: 42px; } }
        ` });
      }
      return route.fulfill({
        contentType: "text/html",
        headers: policy === "default" ? {} : { "content-security-policy": "style-src 'self'" },
        body: '<link rel="stylesheet" href="/cq.css"><div class="shell"><div class="cq-child"></div></div>',
      });
    });
    await page.goto("http://container.test/");
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(() => {
      const child = document.querySelector<HTMLElement>(".cq-child")!;
      const { elements } = window.containerInspection.refresh([child]);
      return {
        authored: elements[0]!.properties.find((row) => row.property === "width")?.authored,
        probeStyles: document.querySelectorAll('[data-nudge-ui="container-probe"]').length,
        adoptedSheets: document.adoptedStyleSheets.length,
      };
    });
    expect(result).toEqual({ authored: "42px", probeStyles: 0, adoptedSheets: 0 });
  });
}

test("a fresh evaluation observes resized containers and cleans up failed reads", async ({ page }) => {
  await page.setContent('<main style="container-type:inline-size;width:800px"><div id="child"></div></main>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const child = document.getElementById("child")!;
    const conditions = ["(min-width: 500px)"];
    const first = window.containerInspection.createContainerQueryEvaluator(document);
    const before = first.matches(child, conditions);
    document.querySelector("main")!.style.width = "200px";
    const after = window.containerInspection.createContainerQueryEvaluator(document).matches(child, conditions);
    const original = window.getComputedStyle;
    let failed = false;
    try {
      window.getComputedStyle = () => { throw new Error("test read failed"); };
      window.containerInspection.createContainerQueryEvaluator(document).matches(child, conditions);
    } catch { failed = true; } finally { window.getComputedStyle = original; }
    return { before, after, failed, cleaned: !document.querySelector('[data-nudge-ui="container-probe"]')
      && child.getAttributeNames().every((name) => !name.startsWith("data-container-probe-")) };
  });
  expect(result).toEqual({ before: true, after: false, failed: true, cleaned: true });
});
