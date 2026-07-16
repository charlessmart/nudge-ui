import { test, expect } from "@playwright/test";

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"] [data-test="token-field"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]').click();
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

async function setBorderRadius(page: import("@playwright/test").Page, value: string): Promise<void> {
  const delink = page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="delink-btn"]');
  if (await delink.count()) await delink.click();
  await page.evaluate((v) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(
      '[data-test="token-field"][data-property="border-radius"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!raw) throw new Error("Missing border-radius raw editor after delinking");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, v);
    raw.dispatchEvent(new Event("change", { bubbles: true }));
    raw.blur();
  }, value);
}

async function changeCount(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.querySelectorAll('[data-test="change-row"]').length ?? 0;
  });
}

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
  const handle = await page.evaluateHandle((p) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const rows = Array.from(sr?.querySelectorAll('[data-test="change-row"]') ?? []);
    const row = rows.find((r) => (r.getAttribute("data-property") ?? "") === p);
    return row?.querySelector('[data-test="change-revert"]') as HTMLElement | null;
  }, property);
  await handle.asElement()!.click();
}

async function copyDisabled(page: import("@playwright/test").Page): Promise<boolean> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const btn = sr?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null;
    return btn ? btn.disabled : true;
  });
}

test.describe("clipboard permissions", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("dev: copy prompt writes structured markdown to the clipboard", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Save");
    await waitForRow(page);
    await waitForEditors(page);

    await selectBackground(page, "--color-surface-sunken");
    await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

    await setBorderRadius(page, "12px");
    await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(2);

    await page.evaluate(() => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      const btn = sr?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null;
      btn?.click();
    });

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const sr = document.getElementById("design-tool-root")?.shadowRoot;
          const btn = sr?.querySelector('[data-test="copy-prompt"]');
          return btn?.getAttribute("data-copied") === "true";
        });
      }, { timeout: 5000 })
      .toBe(true);

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Design changes for Button.tsx");
    expect(text).toContain("Framework: React + CSS custom properties");
    expect(text).toContain("--color-surface-sunken");
    expect(text).toContain('[data-cid="Button"][data-src*="src/Button.tsx:32"]');
    expect(text).toContain("border-radius");
    expect(text).toContain("12px");
    expect(text).toContain("(not a token — consider adding one)");
  });

  test("dev: copy prompt is disabled when the changes log is empty", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Save");
    await waitForRow(page);
    await waitForEditors(page);

    await expect.poll(async () => copyDisabled(page), { timeout: 5000 }).toBe(true);

    const before = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    await page.evaluate(() => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      const btn = sr?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null;
      btn?.click();
    });
    await page.waitForTimeout(300);
    expect(await copyDisabled(page)).toBe(true);
    const after = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    expect(after).toBe(before);

    await selectBackground(page, "--color-surface-sunken");
    await expect.poll(async () => copyDisabled(page), { timeout: 5000 }).toBe(false);

    await revertChange(page, "background");
    await expect.poll(async () => copyDisabled(page), { timeout: 5000 }).toBe(true);
  });
});
