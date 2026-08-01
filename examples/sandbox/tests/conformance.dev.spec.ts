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
    return root?.querySelector('[data-test="style-editors"]') !== null;
  })).toBe(true);
});

test("dev: logical spacing projects onto physical inspector side controls", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator(".conformance-copy").click();
  const expandButton = page.locator('[data-test="spacing-padding"] [data-test="individual-sides"]');
  await expect(expandButton).toHaveClass(/dt-toggle-button/);
  await expect(expandButton).toHaveClass(/dt-toggle-button--default/);
  await expect.poll(async () => expandButton.boundingBox()).toEqual({ x: expect.any(Number), y: expect.any(Number), width: 32, height: 32 });

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
      paddingHorizontal: field("padding-horizontal"),
      paddingVertical: field("padding-vertical"),
      marginTop: field("margin-top"),
      marginBottom: field("margin-bottom"),
    };
  })).toEqual({
    paddingHorizontal: { token: "1", value: "--conformance-space" },
    paddingVertical: { token: null, value: "0px" },
    marginTop: { token: null, value: "1rem" },
    marginBottom: { token: null, value: "0px" },
  });

  await expandButton.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const field = (property: string) => {
      const element = root?.querySelector<HTMLElement>(`[data-test="token-field"][data-property="${property}"]`);
      return {
        token: element?.querySelector('[data-test="token-chip"]')?.textContent?.trim() ?? null,
        value: element?.querySelector("input")?.value ?? null,
      };
    };
    return {
      paddingTop: field("padding-top"),
      paddingRight: field("padding-right"),
      paddingBottom: field("padding-bottom"),
      paddingLeft: field("padding-left"),
    };
  })).toEqual({
    paddingTop: { token: null, value: "0px" },
    paddingRight: { token: "1", value: "--conformance-space" },
    paddingBottom: { token: null, value: "0px" },
    paddingLeft: { token: "1", value: "--conformance-space" },
  });
});
