import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

// ADR-0045: wrappers are detected from structure and the user's calls outrank detection; cells that cannot
// render offer a prompt for creating the sheet wrapper file.
const PROVIDER_ID = "src/ds/ThemeProbe#ProbeThemeProvider";
const PROBE_ID = "src/ds/ThemeProbe#ThemeProbe";
const LIBRARY_FILE = fileURLToPath(new URL("../.nudge/library.json", import.meta.url));

test.beforeEach(async () => { await rm(LIBRARY_FILE, { force: true }); });
test.afterEach(async () => { await rm(LIBRARY_FILE, { force: true }); });

const openHidden = (page: Page) => page.locator('[data-test="component-library-group"][data-folder-id="hidden:"]').click();
const item = (page: Page, id: string) => page.locator(`[data-test="component-library-item"][data-component-id="${id}"]`);

async function openLibrary(page: Page): Promise<void> {
  await openEditor(page, "/app?nudge-ui=editor");
  await page.locator('[data-test="panel-view-components"]').click();
  await expect(item(page, PROBE_ID)).toBeVisible();
}

test("a detected provider waits in the Hidden folder until the user restores it, and the call survives a reload", async ({ page }) => {
  await openLibrary(page);
  await expect(item(page, PROVIDER_ID)).toHaveCount(0);

  await openHidden(page);
  await expect(item(page, PROVIDER_ID)).toBeVisible();
  const row = page.locator("li.component-library__row", { has: item(page, PROVIDER_ID) });
  await row.hover();
  await row.locator('[data-test="component-library-more"]').click();
  await page.locator('[data-test="component-library-visibility"]').click();

  await expect.poll(async () => (await (await page.request.get("/__nudge_ui__/library")).json()).shown).toEqual([PROVIDER_ID]);

  await openLibrary(page);
  // Listed without opening the hidden group: the restored call came back from the project file.
  await expect(item(page, PROVIDER_ID)).toBeVisible();
});

test("a component the user hides moves to the Hidden folder and can be brought back", async ({ page }) => {
  await openLibrary(page);
  const row = page.locator("li.component-library__row", { has: item(page, PROBE_ID) });
  await row.hover();
  await row.locator('[data-test="component-library-more"]').click();
  await page.locator('[data-test="component-library-visibility"]').click();
  await expect(item(page, PROBE_ID)).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/__nudge_ui__/library")).json()).hidden).toEqual([PROBE_ID]);

  await openHidden(page);
  const hiddenRow = page.locator('[data-test="component-library-hidden"] li.component-library__row', { has: item(page, PROBE_ID) });
  await hiddenRow.hover();
  await hiddenRow.locator('[data-test="component-library-more"]').click();
  await page.locator('[data-test="component-library-visibility"]').click();
  await expect(page.locator('[data-test="component-library-hidden"]').locator(item(page, PROBE_ID))).toHaveCount(0);
  await expect(item(page, PROBE_ID)).toBeVisible();
});

test("a sheet whose cells need a provider offers a setup prompt that names the failure", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/__nudge_ui__/components?component=${encodeURIComponent(PROBE_ID)}`);
  const banner = page.locator('[data-test="sheet-setup"]');
  await expect(banner).toContainText("can't render", { timeout: 20000 });
  await page.locator('[data-test="sheet-setup-copy"]').click();
  await expect(page.locator('[data-test="sheet-setup-copy"]')).toHaveText("Copied");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("useProbeTheme must be used within ProbeThemeProvider");
  expect(prompt).toContain("nudge.sheet.tsx");
});
