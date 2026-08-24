import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const STATIC_SOURCE = "index.html:13:7";
const RENDERED_TEXT_SOURCE = "index.html:14:7";

function projectPath(file: string): string {
  const root = process.env.DESIGN_TOOL_STANDALONE_E2E_ROOT;
  if (!root) throw new Error("The standalone fixture root was not configured.");
  return join(root, file);
}

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("#design-tool-root")).toBeAttached();
  await expect.poll(async () => page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    return Boolean(shadow?.querySelector('[data-test="inspect-tab"]'));
  }), { timeout: 15_000 }).toBe(true);
}

async function setRawValue(
  page: import("@playwright/test").Page,
  property: string,
  value: string,
): Promise<void> {
  const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
  await expect(field).toBeVisible();
  const raw = field.locator('[data-test="raw-input"]');
  if (await raw.count() === 0) {
    await field.locator('[data-test="delink-btn"]').click();
    await expect(raw).toHaveCount(1);
  }
  await raw.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native input value setter is unavailable.");
    input.focus();
    setter.call(input, nextValue);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, value);
}

async function selectToken(
  page: import("@playwright/test").Page,
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

async function computedStyle(
  page: import("@playwright/test").Page,
  selector: string,
  property: string,
): Promise<string> {
  return page.locator(selector).evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name).trim();
  }, property);
}

async function managedSheetText(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const sheet = (document.getElementById("design-tool-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}

async function copyPrompt(page: import("@playwright/test").Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("serves a self-contained inspector and edits static HTML through managed CSS", async ({ page }) => {
  const originalHtml = await readFile(projectPath("index.html"), "utf8");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await waitForInspector(page);

  expect(requests.some((url) => /vite|@react-refresh|@vite/.test(url))).toBe(false);
  // Canvas is enabled on the standalone host (ADR-0012); component semantics
  // remain fail-closed for framework-free pages.
  await expect(page.locator('[data-test="mode-canvas"]')).toHaveCount(1);
  await expect(page.locator('[data-test="component-props-section"]')).toHaveCount(0);

  const button = page.locator("#static-action");
  await expect(button).toHaveAttribute("data-cid", "html:button");
  await expect(button).toHaveAttribute("data-src", STATIC_SOURCE);
  await button.click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute("data-selected-src", STATIC_SOURCE);
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  const originalInlineStyle = await button.getAttribute("style");
  await setRawValue(page, "color", "#123456");
  await expect.poll(() => computedStyle(page, "#static-action", "color")).toBe("rgb(18, 52, 86)");
  expect(await button.getAttribute("style")).toBe(originalInlineStyle);

  const selector = `[data-cid="html:button"][data-src="${STATIC_SOURCE}"]`;
  const rawSheet = await managedSheetText(page);
  expect(rawSheet).toContain(selector);
  expect(rawSheet).toContain("color: rgb(18, 52, 86)");

  await selectToken(page, "background-color", "--color-surface-alt");
  await expect.poll(() => computedStyle(page, "#static-action", "background-color"))
    .toBe("rgb(238, 243, 255)");
  expect(await managedSheetText(page)).toContain("background-color: var(--color-surface-alt)");

  const prompt = await copyPrompt(page);
  expect(prompt).not.toContain("Framework:");
  expect(prompt).toContain(`### html:button (${STATIC_SOURCE})`);
  expect(prompt).not.toContain("data-cid");
  expect(await readFile(projectPath("index.html"), "utf8")).toBe(originalHtml);
});

test("falls back to rendered text and exports an HTML-aware prompt", async ({ page }) => {
  const originalHtml = await readFile(projectPath("index.html"), "utf8");
  await page.goto("/");
  await waitForInspector(page);

  const copy = page.locator("#rendered-copy");
  await copy.dblclick();
  await expect(page.locator('[data-test="inline-text-binding"]')).toHaveText("Rendered text");
  const editor = page.locator('[data-dt-inline-editor="true"]');
  await editor.fill("Updated rendered copy");
  await editor.press("Enter");
  await expect(copy).toHaveText("Updated rendered copy");

  const prompt = await copyPrompt(page);
  expect(prompt).not.toContain("Framework:");
  expect(prompt).toContain("## Rendered text changes");
  expect(prompt).toContain("Rendered text");
  expect(prompt).toContain(RENDERED_TEXT_SOURCE);
  expect(prompt).not.toContain("data-cid");
  expect(await readFile(projectPath("index.html"), "utf8")).toBe(originalHtml);
});

test("assigns runtime identity and exports explicit unknown-source evidence", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  const runtimeButton = page.locator("#runtime-action");
  await expect(runtimeButton).toBeVisible();
  await expect(runtimeButton).toHaveAttribute("data-cid", /^design-tool-runtime-\d+$/);
  await expect(runtimeButton).toHaveAttribute("data-src", /^design-tool:unknown:\d+$/);
  const runtimeCid = await runtimeButton.getAttribute("data-cid");
  await runtimeButton.click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute("data-selected-cid", runtimeCid ?? "");
  await setRawValue(page, "color", "#7442b8");
  await expect.poll(() => managedSheetText(page)).toContain("color: rgb(116, 66, 184)");
  await expect.poll(() => computedStyle(page, "#runtime-action", "color")).toBe("rgb(116, 66, 184)");

  const prompt = await copyPrompt(page);
  expect(prompt).toContain("source unknown; runtime-created DOM");
  expect(prompt).toContain("Rendered element: `<button>`");
  expect(prompt).toContain("Text evidence: `Runtime action`");
  expect(prompt).toContain("Accessible name evidence: `Runtime action`");
  expect(prompt).not.toContain("data-cid");
  expect(prompt).not.toContain("(:0");
});

test("reloads once and refreshes CSS token knowledge after an agent-style source edit", async ({ page }) => {
  const reloadConnection = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/__design_tool__/reload");
  await page.goto("/");
  await reloadConnection;
  await waitForInspector(page);
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });

  const cssPath = projectPath("styles.css");
  const originalCss = await readFile(cssPath, "utf8");
  const updatedCss = originalCss.replace("--color-accent: #2f6fed;", "--color-accent: #de446e;");
  expect(updatedCss).not.toBe(originalCss);
  await writeFile(cssPath, updatedCss);

  await expect.poll(() => navigations, { timeout: 15_000 }).toBe(1);
  await waitForInspector(page);
  await expect.poll(() => computedStyle(page, "#static-action", "color"))
    .toBe("rgb(222, 68, 110)");
  await page.locator('[data-test="tokens-tab"]').click();
  await expect(page.locator('[data-token-name="--color-accent"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const bridgeWindow = window as Window & {
      __designTool?: {
        inspect(selector: string): { availableTokens: Array<{ name: string; value: string }> } | null;
      };
    };
    const token = bridgeWindow.__designTool?.inspect("#static-action")?.availableTokens
      .find((entry) => entry.name === "--color-accent");
    return token?.value ?? "";
  })).toBe("#de446e");
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/__design_tool__/manifest");
    const manifest = await response.json() as { revision?: unknown };
    return manifest.revision;
  })).toBe(1);
  expect(navigations).toBe(1);
  expect(await readFile(projectPath("styles.css"), "utf8")).toBe(updatedCss);
});
