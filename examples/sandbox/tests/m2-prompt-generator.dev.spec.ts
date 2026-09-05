import { test, expect } from "@playwright/test";

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"] [data-test="token-field"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]').click();
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

async function setBorderRadius(page: import("@playwright/test").Page, value: string): Promise<void> {
  const delink = page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="delink-btn"]');
  if (await delink.count()) await delink.click();
  await page.evaluate((v) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
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
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.querySelectorAll('[data-test="change-row"]').length ?? 0;
  });
}

async function openChangesLog(page: import("@playwright/test").Page): Promise<void> {
  const changes = page.locator('[data-test="changes-log"]');
  await expect(changes).toBeAttached();
  const isOpen = await changes.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await changes.locator('[data-test="changes-toggle"]').click();
  await expect.poll(() => changes.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
}

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
  await openChangesLog(page);
  const handle = await page.evaluateHandle((p) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const rows = Array.from(sr?.querySelectorAll('[data-test="change-row"]') ?? []);
    const row = rows.find((r) => (r.getAttribute("data-property") ?? "") === p);
    return row?.querySelector('[data-test="change-revert"]') as HTMLElement | null;
  }, property);
  await handle.asElement()!.click();
}

async function copyDisabled(page: import("@playwright/test").Page): Promise<boolean> {
  return await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const btn = sr?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null;
    return btn ? btn.disabled : true;
  });
}

test.describe("clipboard permissions", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("dev: copy prompt writes structured markdown to the clipboard", async ({ page }) => {
    await page.goto("/playground");
    await page.click("text=Save");
    await waitForRow(page);
    await waitForEditors(page);

    await expect(page.locator("button").first()).toHaveAttribute(
      "data-src",
      "src/Button.tsx:13:6",
    );

    await selectBackground(page, "--color-surface-sunken");
    await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

    await setBorderRadius(page, "12px");
    await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(2);

    await page.evaluate(() => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      const btn = sr?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null;
      btn?.click();
    });

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
          const btn = sr?.querySelector('[data-test="copy-prompt"]');
          return btn?.getAttribute("data-copied") === "true";
        });
      }, { timeout: 5000 })
      .toBe(true);

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("# Requested design changes");
    expect(text).not.toContain("Framework:");
    expect(text).toContain("--color-surface-sunken");
    expect(text).not.toContain("data-cid");
    expect(text).toContain("border-radius");
    expect(text).toContain("12px");
    expect(text).not.toContain("consider adding");
  });

  test("dev: copy prompt is disabled when the changes log is empty", async ({ page }) => {
    await page.goto("/playground");
    await page.click("text=Save");
    await waitForRow(page);
    await waitForEditors(page);

    await expect.poll(async () => copyDisabled(page), { timeout: 5000 }).toBe(true);

    const before = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
    await page.evaluate(() => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
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

  test("dev: prompt settings customize the copied prompt", async ({ page }) => {
    await page.goto("/playground");

    const menuButton = page.locator('[data-test="copy-prompt-menu"]');
    await expect(menuButton).toBeEnabled();
    await menuButton.click();
    await page.locator('[data-test="prompt-settings-option"]').click();

    const dialog = page.locator('[data-test="prompt-settings-dialog"]');
    await expect(dialog).toBeVisible();
    const instructions = page.locator('[data-test="prompt-custom-instructions"]');
    await expect(instructions).toHaveValue(/Preserve existing tokens, logical properties/);
    await instructions.fill("Use the project's existing component patterns.");
    await page.locator('[data-test="prompt-settings-done"]').click();
    await expect(dialog).toHaveCount(0);

    await page.click("text=Save");
    await waitForRow(page);
    await waitForEditors(page);
    await selectBackground(page, "--color-surface-sunken");
    await expect.poll(async () => copyDisabled(page), { timeout: 5000 }).toBe(false);

    await page.locator('[data-test="copy-prompt"]').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 })
      .toContain("Use the project's existing component patterns.");
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).not.toContain("Preserve existing tokens, logical properties");
  });

  test("dev: general settings navigates between prompt, MCP, and token sections", async ({ page }) => {
    await page.goto("/playground");

    await page.locator('[data-test="copy-prompt-menu"]').click();
    await page.locator('[data-test="mcp-setup-option"]').click();

    await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
    await expect(page.locator('[data-test="settings-section-mcp"]')).toBeVisible();
    await expect(page.locator('[data-test="mcp-connection-timeline"] > li')).toHaveCount(3);

    await page.locator('[data-test="settings-nav-tokens"]').click();
    await expect(page.locator('[data-test="settings-section-tokens"]')).toBeVisible();
    await expect(page.locator('[data-test="tokens-panel"]')).toBeVisible();

    await page.locator('[data-test="settings-nav-instructions"]').click();
    await expect(page.locator('[data-test="prompt-custom-instructions"]')).toBeVisible();
  });

  test("dev: copy prompt exports only the final destination after repeated moves", async ({ page }) => {
    await page.goto("/playground");
    const item = page.locator('[data-test="flex-child-a"]');
    await item.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => page.locator('[data-test="flex-container"]').textContent()).toBe("BCA");

    await page.evaluate(() => {
      const root = document.getElementById("nudge-ui-root")?.shadowRoot;
      (root?.querySelector('[data-test="copy-prompt"]') as HTMLButtonElement | null)?.click();
    });
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("## Structural changes");

    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt.split("\n").filter((line) => line.startsWith("- Move "))).toHaveLength(1);
    expect(prompt).not.toContain("position 1");
  });
});
