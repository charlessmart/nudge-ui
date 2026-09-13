import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

type RowInfo = {
  property: string;
  token: string;
  name: string;
  value: string;
};

async function tokenRows(page: import("@playwright/test").Page): Promise<RowInfo[]> {
  return await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const rows = sr?.querySelectorAll('[data-test="token-field"]') ?? [];
    const out: RowInfo[] = [];
    rows.forEach((row) => {
      const property = row.getAttribute("data-property") ?? "";
      const chip = row.querySelector('[data-test="token-chip"]');
      const token = chip?.textContent ?? "";
      const name = token;
      const value = row.querySelector('[data-test="raw-input"]')?.getAttribute("value") ?? "";
      out.push({ property, token, name: name.trim(), value: value.trim() });
    });
    return out;
  });
}

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      const rows = await tokenRows(page);
      return rows.some((row) => row.property === "background-color") ? rows : null;
    }, { timeout: 5000 })
    .toBeTruthy();
}

async function expandSpacing(page: import("@playwright/test").Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  const add = spacing.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function btnBackground(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
}

async function selectSuggestion(page: import("@playwright/test").Page, value: string): Promise<void> {
  await expect
    .poll(async () => page.evaluate((token) => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, value), { timeout: 5000 })
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))?.click();
  }, value);
}

async function selectTokenFromChip(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
  const chip = field.locator('[data-test="token-chip"]');
  if (await chip.count() > 0) {
    await chip.click();
  } else {
    await field.locator('[data-test="raw-input"]').fill("");
  }
  await selectSuggestion(page, value);
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await selectTokenFromChip(page, "background-color", value);
}

async function selectPromote(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.locator(`[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`).fill("");
  await selectSuggestion(page, value);
}

test("dev: swapping a token writes a managed-stylesheet rule and changes background live", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);

  const before = await btnBackground(page);

  await selectBackground(page, "--color-surface-sunken");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect
    .poll(async () => btnBackground(page), { timeout: 5000 })
    .not.toBe(before);
});

test("dev: selection defaults to Base and can target an authored hover state", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="stateful-button"]').click();
  await waitForRow(page);

  const state = page.locator('[data-test="style-state"]');
  await expect(state.locator(".field-row__label")).toHaveText("State");
  await expect(state.locator(".field-row__label")).toHaveCSS("font-weight", "400");
  await expect(state.locator("[data-test=\"style-state-select\"]")).toHaveCSS("height", "32px");
  const stateGrid = await state.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" "));
  expect(stateGrid).toHaveLength(2);
  const stateAlignment = await page.evaluate(() => {
    const shadow = document.getElementById("nudge-ui-root")?.shadowRoot;
    const stateSelect = shadow?.querySelector<HTMLElement>('[data-test="style-state-select"]');
    const panelBody = shadow?.querySelector<HTMLElement>(".panel__body");
    if (!stateSelect || !panelBody) return null;
    const panelBodyStyle = getComputedStyle(panelBody);
    return {
      stateRight: stateSelect.getBoundingClientRect().right,
      contentRight: panelBody.getBoundingClientRect().right - Number.parseFloat(panelBodyStyle.paddingRight),
    };
  });
  expect(stateAlignment).not.toBeNull();
  expect(Math.abs(stateAlignment!.stateRight - stateAlignment!.contentRight)).toBeLessThanOrEqual(1);

  const stateSelect = state.locator('[data-test="style-state-select"]');
  await expect(stateSelect).toHaveAttribute("role", "combobox");
  await expect(stateSelect).toContainText("Base");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"]'))
    .toContainText("--color-surface-raised");
  const backgroundSwatch = page.locator(
    '[data-test="token-field"][data-property="background-color"] [data-test="token-color-swatch"]',
  );
  const baseSwatchStyle = await backgroundSwatch.getAttribute("style");

  await stateSelect.click();
  await page.locator('[data-value="hover"]').click();
  const backgroundField = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(backgroundField).toContainText("--color-accent");
  await expect
    .poll(async () => backgroundSwatch.getAttribute("style"), { timeout: 5000 })
    .not.toBe(baseSwatchStyle);
  const picker = backgroundField.locator('[data-test="token-color-input"]');
  await expect(picker).toBeVisible();
  // Use a concrete value that is not one of the sandbox's token values.
  await picker.evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, "#13579b");

  await expect.poll(() => sheetText(page), { timeout: 5000 })
    .toContain(':hover { background-color: rgb(19, 87, 155); }');
});

test("dev: token unlink action appears over the chip on hover", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);

  const field = page.locator('[data-test="token-field"][data-property="color"]');
  const chip = field.locator('[data-test="token-chip"]');
  const delink = field.locator('[data-test="delink-btn"]');

  await expect(chip).toBeVisible();
  await chip.hover();
  await expect(delink).toBeVisible();
});

test("dev: replacing a hardcoded spacing value with a token writes a rule to the sheet", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  await selectPromote(page, "padding-top", "--space-2");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("padding-top: var(--space-2);");
  await expect
    .poll(async () => tokenRows(page), { timeout: 5000 })
    .toEqual(expect.arrayContaining([expect.objectContaining({ property: "padding-top", token: "8" })]));
});

test("dev: typing a spacing value keeps its matching token suggestion visible", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  await page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]').fill("8px");

  await expect
    .poll(async () => page.evaluate(() => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .map((item) => item.textContent?.trim());
    }), { timeout: 5000 })
    .toEqual(expect.arrayContaining([expect.stringContaining("--space-2")]));
});

test("dev: Enter applies a typed spacing value with no matching token", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  const input = page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]');
  await input.fill("");
  await input.type("7px");
  await expect(input).toHaveValue("7px");
  await input.press("Enter");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("padding-top: 7px;");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .not.toContain("padding-top: var(--space-");
});

test("dev: Enter completes a bare spacing number with px", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  const input = page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]');
  await input.fill("7");
  await input.press("Enter");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("padding-top: 7px;");
});

test("dev: Enter completes a bare font-size number with px", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);

  const input = page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]');
  await input.fill("7");
  await input.press("Enter");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("font-size: 7px;");
});

test("dev: Enter applies a typed hex colour with no matching token", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);

  await page.locator('[data-test="token-field"][data-property="color"] [data-test="delink-btn"]').click();
  const input = page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("rgb(32, 33, 31)");
  // Avoid the sandbox's real #123456 token so Enter commits the raw value.
  await input.fill("#13579b");
  await expect(input).toHaveValue("#13579b");
  await input.press("Enter");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("color: rgb(19, 87, 155);");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .not.toContain("color: var(--color-");
});

test("dev: edits survive a React re-render of the host app", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Save");
  await waitForRow(page);

  await selectBackground(page, "--color-surface-sunken");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect(page.locator('[data-test="click-counter"]')).toHaveText(/clicks: 0/);

  await page.evaluate(() => {
    const fn = (window as unknown as { __nudgeUiRerender?: () => void }).__nudgeUiRerender;
    fn?.();
    fn?.();
  });

  await expect(page.locator('[data-test="click-counter"]')).toHaveText(/clicks: 2/);

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect
    .poll(async () => btnBackground(page), { timeout: 5000 })
    .toBe("rgb(244, 243, 240)");
});
