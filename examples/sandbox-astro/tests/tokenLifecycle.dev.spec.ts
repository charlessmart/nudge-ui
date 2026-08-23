import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Stage 4 conformance (docs/features/astro-host-adapter.md): token lifecycle
 * and reload coherence for the Astro host Adapter.
 *
 * The shared Vite plugin owns token inventory, exactly-once publication, and
 * the reload contract; Astro inherits them because its dev server is a Vite
 * dev server. These specs pin that inheritance end-to-end against the real
 * Astro pipeline.
 */

const CSS_PATH = join(process.cwd(), "src", "styles", "global.css");

interface CatalogEntry {
  name: string;
  cssName: string;
  declarations: Array<{ value: string; source: string; context?: { selector?: string } }>;
}

/** Inspect an element through the page's bridge and return its token catalog. */
function bridgeCatalog(page: Page, selector: string): Promise<CatalogEntry[]> {
  return page.evaluate((sel) =>
    (
      window as unknown as {
        __designTool?: {
          inspect(selector: string): { catalog: CatalogEntry[] } | null;
        };
      }
    ).__designTool?.inspect(sel)?.catalog ?? [],
  selector);
}

function findEntry(catalog: CatalogEntry[], cssName: string): CatalogEntry | undefined {
  return catalog.find((definition) => definition.cssName === cssName);
}

async function waitForInspector(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __designTool?: unknown }).__designTool)))
    .toBe(true);
}

/** Parse the serialized virtual token module served by the dev server. */
async function readVirtualTokenModule(request: {
  get(url: string): Promise<{ text(): Promise<string> }>;
}): Promise<{
  generation: string;
  tokens: string[];
  diagnostics: Array<{ code: string; message: string; module?: string }>;
}> {
  const response = await request.get("/@id/__x00__virtual:design-tokens");
  const code = await response.text();
  const extract = (name: string): string =>
    new RegExp(`^export const ${name} = (.*);$`, "m").exec(code)?.[1] ?? "undefined";
  return {
    generation: JSON.parse(extract("tokenGeneration")) as string,
    tokens: (JSON.parse(extract("tokenCatalog")) as CatalogEntry[]).map((entry) => entry.cssName),
    diagnostics: JSON.parse(extract("tokenDiagnostics")) as Array<{ code: string; message: string; module?: string }>,
  };
}

test("dev: :root custom properties are listed with project-relative provenance", async ({ page }) => {
  const severeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /design-tool|\$RefreshSig/i.test(message.text())) {
      severeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/design-tool|\$RefreshSig/i.test(error.message)) severeErrors.push(error.message);
  });

  await page.goto("/");
  await waitForInspector(page);

  // Tokens tab lists the fixture's global custom properties.
  await page.locator('[data-test="tokens-tab"]').click();
  const panel = page.locator('[data-test="tokens-panel"]');
  await expect(panel).toBeVisible();
  for (const name of ["--color-accent", "--color-surface", "--color-ink", "--space-lg", "--radius-card"]) {
    await expect(panel.locator(`[data-token-name="${name}"]`)).toBeAttached();
  }
  await expect(page.locator('[data-test="token-count"]')).toContainText(/^[5-9]|[1-9]\d/);

  // Provenance is project-relative with authored line numbers, carried through
  // the inspection bridge's catalog.
  await expect.poll(async () => {
    const entry = findEntry(await bridgeCatalog(page, ".site-header .site-title"), "--color-accent");
    return entry?.declarations[0]?.source ?? "";
  }).toBe("src/styles/global.css:2");

  expect(severeErrors).toEqual([]);
});

test("dev: editing project CSS refreshes tokens once through exactly one reload", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  const before = await readVirtualTokenModule(page.request);

  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });

  const originalCss = await readFile(CSS_PATH, "utf8");
  const accentValue = "#de446e";
  // A new :root table row proves the reloaded document received a fresh
  // snapshot rather than a stale cached module.
  const probeRule = `\n:root {\n  --stage4-reload-probe: 7px;\n}\n`;
  const updatedCss = originalCss
    .replace("--color-accent: #0f62fe;", `--color-accent: ${accentValue};`)
    .concat(probeRule);
  expect(updatedCss).not.toBe(originalCss);
  const probeLine = updatedCss.slice(0, updatedCss.indexOf("--stage4-reload-probe")).split("\n").length;

  try {
    await writeFile(CSS_PATH, updatedCss);

    // Exactly ONE full reload carries the new document; token knowledge is
    // already refreshed when it arrives (one coherent snapshot).
    await expect.poll(() => navigations, { timeout: 20_000 }).toBe(1);
    await waitForInspector(page);

    // The reloaded document renders the edited token value...
    await expect.poll(() =>
      page.locator(".site-header .site-title").evaluate((element) =>
        getComputedStyle(element).getPropertyValue("color").trim()),
    ).toBe("rgb(222, 68, 110)");

    // ...and its token knowledge contains BOTH the changed value and the newly
    // appended declaration with correct provenance (a fresh snapshot, not a
    // stale cached one).
    await expect.poll(async () => {
      const catalog = await bridgeCatalog(page, ".site-header .site-title");
      const accent = findEntry(catalog, "--color-accent");
      const probe = findEntry(catalog, "--stage4-reload-probe");
      return [
        accent?.declarations[0]?.value ?? "",
        probe?.declarations[0]?.value ?? "",
        probe?.declarations[0]?.source ?? "",
      ].join("|");
    }, { timeout: 15_000 }).toBe(`${accentValue}|7px|src/styles/global.css:${probeLine}`);

    // The published generation actually bumped across the edit.
    const after = await readVirtualTokenModule(page.request);
    expect(after.generation).not.toBe(before.generation);
    expect(after.tokens).toContain("--stage4-reload-probe");

    // No second reload followed the first.
    await expect.poll(() => navigations, { timeout: 10_000 }).toBe(1);
    expect(await page.locator("#design-tool-root").count()).toBe(1);
  } finally {
    await writeFile(CSS_PATH, originalCss);
    await expect.poll(async () => {
      const restored = await readVirtualTokenModule(page.request);
      return restored.tokens.includes("--stage4-reload-probe");
    }, { timeout: 20_000 }).toBe(false);
  }
});

test("dev: malformed CSS publishes a diagnostic and keeps raw CSS inspection alive", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  const originalCss = await readFile(CSS_PATH, "utf8");
  try {
    await writeFile(CSS_PATH, ":root {\n  --color-accent: #0f62fe;\n  --broken {{{;\n");

    // The inventory keeps serving the catalog and reports the broken artifact
    // through the transport instead of going dark.
    await expect.poll(async () => {
      const module = await readVirtualTokenModule(page.request);
      return module.diagnostics.some((diagnostic) =>
        diagnostic.code === "stylesheet-parse-failed"
        && (diagnostic.module ?? "").includes("src/styles/global.css"));
    }, { timeout: 20_000 }).toBe(true);

    // The dev server still renders the page and the inspector mounts on it.
    // (Proxy assertion: "raw inspection alive" is pinned via mount, since a
    // broken stylesheet chain cannot meaningfully serve a preview.) The
    // navigation can abort while the broken module chain settles, so retry
    // until it completes with a response.
    await expect.poll(async () => {
      try {
        const response = await page.goto("/", { waitUntil: "domcontentloaded" });
        return response?.status() ?? 0;
      } catch {
        return 0;
      }
    }, { timeout: 20_000 }).toBe(200);
    await waitForInspector(page);
  } finally {
    await writeFile(CSS_PATH, originalCss);
  }

  // Recovery: the diagnostic clears once the stylesheet parses again.
  await expect.poll(async () => {
    const module = await readVirtualTokenModule(page.request);
    return module.diagnostics.filter((diagnostic) => diagnostic.code === "stylesheet-parse-failed").length;
  }, { timeout: 20_000 }).toBe(0);
  await waitForInspector(page);
});

test("dev: scoped-style tokens resolve per-element with author-vocabulary prompts (ADR-0011)", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  // Card.astro declares eight scoped custom properties so the theme-table
  // policy admits the scoped rule into the build catalog. Scoped tokens do
  // not apply to the document root, so the Tokens panel intentionally omits
  // them; they surface through per-element inspection instead.
  await expect.poll(async () => {
    const catalog = await bridgeCatalog(page, "article.card");
    const cardBg = findEntry(catalog, "--card-bg");
    return [
      cardBg ? "present" : "missing",
      cardBg?.declarations[0]?.value ?? "",
      cardBg?.declarations[0]?.source ?? "",
    ].join("|");
  }, { timeout: 20_000 }).toBe("present|#ffffff|src/components/Card.astro:1");

  // The raw scoped selector is retained on the declaration so managed-rule
  // resolution keeps matching the rendered DOM.
  const rawSelector = await page.evaluate(() => {
    const catalog = (
      window as unknown as { __designTool?: { inspect(selector: string): { catalog: CatalogEntry[] } | null } }
    ).__designTool?.inspect("article.card")?.catalog ?? [];
    return catalog.find((entry) => entry.cssName === "--card-bg")
      ?.declarations[0]?.context?.selector ?? "";
  });
  expect(rawSelector).toContain("[data-astro-cid-");
  expect(rawSelector).toContain(".card");

  // Editing a property onto a scoped token yields a prompt naming the token
  // without leaking Astro's scoping structure. border-radius starts backed by
  // the global --radius-card; swapping it to the scoped --card-radius creates
  // an element change record.
  const card = page.locator("article.card").first();
  await expect(card).toHaveAttribute("data-cid", /astro:/);
  await card.click();
  await selectToken(page, "border-radius", "--card-radius");
  await expect.poll(() =>
    page.locator("article.card").first().evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--card-bg").trim()),
  ).toBeTruthy();
  const prompt = await copyPrompt(page);
  expect(prompt).toContain("--card-radius");
  expect(prompt).not.toContain("data-astro-cid");
  expect(prompt).not.toContain(".astro-");
});

async function selectToken(
  page: Page,
  property: string,
  tokenName: string,
): Promise<void> {
  const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
  await expect(field).toBeVisible();
  await field.locator('[data-test="token-chip"]').click();
  const suggestion = page.locator('[data-test="suggestion-item"]').filter({ hasText: tokenName }).first();
  await expect(suggestion).toBeVisible();
  await suggestion.click();
}

async function copyPrompt(page: Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  return page.evaluate(() => navigator.clipboard.readText());
}
