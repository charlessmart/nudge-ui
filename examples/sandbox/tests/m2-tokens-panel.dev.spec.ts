import { test, expect } from "@playwright/test";

async function tokenRowText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const panel = sr?.querySelector('[data-test="tokens-panel"]') ?? null;
    if (!panel) return "";
    const rows = panel.querySelectorAll('[data-test="token-row"]');
    const out: { property: string; token: string; name: string; value: string }[] = [];
    rows.forEach((row) => {
      const property = row.getAttribute("data-property") ?? "";
      const token = row.getAttribute("data-token") ?? "";
      const name = row.querySelector('[data-test="token-name"]')?.textContent ?? "";
      const value = row.querySelector('[data-test="token-value"]')?.textContent ?? "";
      out.push({ property, token, name: name.trim(), value: value.trim() });
    });
    return JSON.stringify(out);
  });
}

test("dev: token panel lists resolved tokens for the selected .btn element", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => {
      const text = await tokenRowText(page);
      if (!text) return null;
      const rows = JSON.parse(text) as unknown[];
      return rows.length > 0 ? rows : null;
    }, { timeout: 5000 })
    .toBeTruthy();

  const parsed = JSON.parse((await tokenRowText(page)) ?? "[]") as {
    property: string;
    token: string;
    name: string;
    value: string;
  }[];
  const byProp = new Map(parsed.map((r) => [r.property, r]));

  const background = byProp.get("background");
  expect(background).toBeTruthy();
  expect(background!.token).toBe("--color-surface-raised");
  expect(background!.name).toBe("--color-surface-raised");
  expect(background!.value.length).toBeGreaterThan(0);

  const borderRadius = byProp.get("border-radius");
  expect(borderRadius).toBeTruthy();
  expect(borderRadius!.token).toBe("--space-1");

  const cursor = byProp.get("cursor");
  expect(cursor).toBeTruthy();
  expect(cursor!.token).toBe("");
  expect(cursor!.name).toBe("not a token");

  const padding = byProp.get("padding");
  expect(padding).toBeTruthy();
  expect(padding!.token).toBe("--space-1");
});

test("dev: token panel updates when the selection steps up the hierarchy", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => {
      const text = await tokenRowText(page);
      return text && JSON.parse(text).length > 0;
    }, { timeout: 5000 })
    .toBe(true);

  const before = JSON.parse((await tokenRowText(page)) ?? "[]") as { property: string; token: string }[];
  expect(before.some((r) => r.property === "background")).toBe(true);
  expect(before.some((r) => r.token === "--space-2")).toBe(false);

  await page.keyboard.press("ArrowUp");

  await expect
    .poll(async () => {
      const text = await tokenRowText(page);
      if (!text) return null;
      const rows = JSON.parse(text) as { property: string; token: string }[];
      return rows.some((r) => r.property === "padding" && r.token === "--space-2")
        ? rows
        : null;
    }, { timeout: 5000 })
    .toBeTruthy();
});