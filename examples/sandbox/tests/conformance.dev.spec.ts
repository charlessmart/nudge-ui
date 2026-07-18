import { expect, test } from "@playwright/test";

test("dev: standard CSS conformance fixture keeps authored attribution separate from browser output", async ({ page }) => {
  await page.goto("/conformance");
  const card = page.locator(".conformance-card");
  await expect(card).toBeVisible();
  const facts = await card.evaluate((element) => ({
    authoredPadding: [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    }).map((rule) => rule.cssText).find((text) => text.includes(".conformance-card")) ?? "",
    computedPadding: getComputedStyle(element).paddingTop,
    computedColor: getComputedStyle(element).color,
    catalog: (window as unknown as { __designTokenCatalog?: { cssName: string; declarations: unknown[] }[] }).__designTokenCatalog ?? [],
  }));
  expect(facts.authoredPadding).toContain("var(--conformance-alias)");
  expect(facts.computedPadding).toBe("16px");
  expect(facts.computedColor).toBe("rgb(51, 65, 85)");
  expect(facts.catalog.some((entry) => entry.cssName === "--conformance-alias")).toBe(true);

  await card.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="selection"]')?.textContent ?? "";
  })).toContain("ConformanceCard");
});

test("dev: logical spacing projects onto physical inspector side controls", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator(".conformance-copy").click();

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    if (!root) return null;
    const field = (property: string) => {
      const element = root.querySelector<HTMLElement>(`[data-test="token-field"][data-property="${property}"]`);
      return {
        token: element?.querySelector('[data-test="token-chip"]')?.textContent?.trim() ?? null,
        value: element?.querySelector("input")?.value ?? null,
      };
    };
    return {
      paddingLeft: field("padding-left"),
      paddingRight: field("padding-right"),
      marginTop: field("margin-top"),
      marginBottom: field("margin-bottom"),
    };
  })).toEqual({
    paddingLeft: { token: "--conformance-space", value: "--conformance-space" },
    paddingRight: { token: "--conformance-space", value: "--conformance-space" },
    marginTop: { token: null, value: "1rem" },
    marginBottom: { token: null, value: "0px" },
  });
});
