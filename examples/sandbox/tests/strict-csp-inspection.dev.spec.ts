import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

declare global {
  interface Window {
    strictCsp: {
      previewWidth(selector: string, width: string): { authored?: string; source?: string; styleElements: number };
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
        import { createBrowserCssInspection } from './inspection/browserCssInspection.ts';
        import { applyRules } from './projection/managedStylesheet.ts';
        import { collectRules } from './tokens/resolution/cssomCollector.ts';
        import { preferAdoptedStylesheets } from './runtime/ownedStylesheets.ts';
        export function previewWidth(selector, width) {
          preferAdoptedStylesheets();
          applyRules([{ selector, declarations: { width } }]);
          const element = document.querySelector(selector);
          const session = createBrowserCssInspection({ document, tokenKnowledge: { definitions: [], generation: 'test' } });
          try {
            const row = session.inspect(element).properties.find((candidate) => candidate.property === 'width');
            const rule = collectRules(document).rules.find((candidate) => candidate.declarations.some((d) => d.value === width));
            return { authored: row?.authored, source: rule?.source, styleElements: document.querySelectorAll('style').length };
          } finally { session.dispose(); }
        }
      `,
      resolveDir: fileURLToPath(new URL("../../../packages/nudge-ui/src/inspector/", import.meta.url)),
      loader: "ts",
    },
    bundle: true, write: false, format: "iife", globalName: "strictCsp",
    platform: "browser", loader: { ".css": "text", ".svg": "dataurl" }, define: { "import.meta.env.DEV": "true" },
  });
  bundle = result.outputFiles[0]!.text;
});

test("managed preview rules stay inspectable when style-src blocks <style>", async ({ page }) => {
  await page.route("http://strict.test/**", (route) => {
    if (route.request().url().endsWith("/app.css")) {
      return route.fulfill({ contentType: "text/css", body: ".card { width: 10px; }" });
    }
    return route.fulfill({
      contentType: "text/html",
      headers: { "content-security-policy": "style-src 'self'" },
      body: '<link rel="stylesheet" href="/app.css"><div class="card"></div>',
    });
  });
  await page.goto("http://strict.test/");
  await page.addScriptTag({ content: bundle });

  const result = await page.evaluate(() => window.strictCsp.previewWidth(".card", "42px"));

  await expect(page.locator(".card")).toHaveCSS("width", "42px");
  expect(result).toEqual({ authored: "42px", source: "#nudge-ui-styles", styleElements: 0 });
});
