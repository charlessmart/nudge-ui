import { expect, type Page } from "@playwright/test";
import { getAppFrame } from "@nudge-ui/compatibility/playwright";

function inspectorHas(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((query) => Boolean(
    document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector(query),
  ), selector);
}

export async function waitForInspector(page: Page): Promise<void> {
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();
}

export async function waitForEditors(page: Page): Promise<void> {
  await expect.poll(() => inspectorHas(page, '[data-test="style-editors"]')).toBe(true);
}

export async function waitForRow(page: Page): Promise<void> {
  await expect.poll(() => inspectorHas(page, '[data-test="style-editors"] [data-test="token-field"]')).toBe(true);
}

/** Sets a token field's raw value the way a committed edit does: focus, change, blur. */
export async function setInput(page: Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const raw = document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector<HTMLInputElement>(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    );
    if (!raw) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, v);
    raw.dispatchEvent(new Event("change", { bubbles: true }));
    raw.blur();
  }, { p: property, v: value });
}

export async function selectBackground(page: Page, value: string): Promise<void> {
  await page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]').click();
  await expect
    .poll(async () => page.evaluate((token) => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, value))
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))?.click();
  }, value);
}

export async function expandSpacing(page: Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  const add = spacing.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

export async function openTokensSettings(page: Page): Promise<void> {
  await page.locator('[data-test="panel-view-tokens"]').click();
  await expect(page.locator('[data-test="document-tokens"]')).toBeVisible();
}

/** Opens the changes list from its count beside the copy button. */
export async function openChangesLog(page: Page): Promise<void> {
  const toggle = page.locator('[data-test="changes-toggle"]');
  await expect(toggle).toBeEnabled();
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

export async function changeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.querySelectorAll('[data-test="change-row"]').length ?? 0;
  });
}

/** Reverts a change from its row in the changes list; "background" names the background-color row too. */
export async function revertChange(page: Page, property: string): Promise<void> {
  await openChangesLog(page);
  const handle = await page.evaluateHandle((p) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const rows = Array.from(sr?.querySelectorAll('[data-test="change-row"]') ?? []);
    const row = rows.find((r) => {
      const property = r.getAttribute("data-property") ?? "";
      return property === p || property.startsWith(`${p}-`);
    });
    return (row ?? null) as HTMLElement | null;
  }, property);
  // The revert button shows on its row's hover, as it does for a person.
  const row = handle.asElement()!;
  await row.hover();
  await (await row.$('[data-test="change-revert"]'))!.click();
}

export async function btnBackground(page: Page): Promise<string> {
  return await (await getAppFrame(page)).evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
}
