import { test, expect } from "@playwright/test";

type RowInfo = {
  property: string;
  token: string;
  name: string;
  value: string;
};

async function tokenRows(page: import("@playwright/test").Page): Promise<RowInfo[]> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
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
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
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
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, value), { timeout: 5000 })
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
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
  await page.goto("/");
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
  await page.goto("/");
  await page.addStyleTag({ content: ".btn:focus { outline-color: transparent; } .btn:active { transform: none; }" });
  await page.click("text=Save");
  await waitForRow(page);

  await expect(page.locator('[data-test="style-state-base"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-test="style-state-hover"]')).toHaveCount(1);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"]'))
    .toContainText("--color-surface-raised");

  await page.locator('[data-test="style-state-hover"]').click();
  const backgroundField = page.locator('[data-test="token-field"][data-property="background-color"]');
  if (await backgroundField.locator('[data-test="token-chip"]').count()) {
    await backgroundField.locator('[data-test="delink-btn"]').click();
  } else {
    await page.locator('[data-test="color-picker"][data-property="background-color"] [data-test="add-color"]').click();
  }
  const background = backgroundField.locator('[data-test="raw-input"]');
  await background.fill("#123456");
  await background.press("Enter");

  await expect.poll(() => sheetText(page), { timeout: 5000 })
    .toContain(':hover { background-color: #123456; }');
});

test("dev: replacing a hardcoded spacing value with a token writes a rule to the sheet", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  await selectPromote(page, "padding-top", "--space-2");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("padding-top: var(--space-2);");
  await expect
    .poll(async () => tokenRows(page), { timeout: 5000 })
    .toEqual(expect.arrayContaining([expect.objectContaining({ property: "padding-top", token: "--space-2" })]));
});

test("dev: typing a spacing value keeps its matching token suggestion visible", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);
  await expandSpacing(page);

  await page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]').fill("8px");

  await expect
    .poll(async () => page.evaluate(() => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .map((item) => item.textContent?.trim());
    }), { timeout: 5000 })
    .toEqual(expect.arrayContaining([expect.stringContaining("--space-2")]));
});

test("dev: Enter applies a typed spacing value with no matching token", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
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

test("dev: Enter applies a typed hex colour with no matching token", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  await page.locator('[data-test="token-field"][data-property="color"] [data-test="delink-btn"]').click();
  const input = page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]');
  await input.fill("");
  await input.type("#123456");
  await expect(input).toHaveValue("#123456");
  await input.press("Enter");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("color: #123456;");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .not.toContain("color: var(--color-");
});

test("dev: edits survive a React re-render of the host app", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  await selectBackground(page, "--color-surface-sunken");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect(page.locator('[data-test="click-counter"]')).toHaveText(/clicks: 0/);

  await page.evaluate(() => {
    const fn = (window as unknown as { __designToolRerender?: () => void }).__designToolRerender;
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
