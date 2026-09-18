import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("dev: standard CSS conformance fixture keeps authored attribution separate from browser output", async ({ page }) => {
  const app = await openEditor(page, "/conformance");
  const card = app.locator(".conformance-card");
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

  await card.click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
});

test("dev: logical spacing projects onto physical inspector side controls", async ({ page }) => {
  const app = await openEditor(page, "/conformance");
  await app.locator(".conformance-copy").click();
  const expandButton = page.locator('[data-test="spacing-padding"] [data-test="individual-sides"]');
  await expect(expandButton).toHaveClass(/toggle-button/);
  await expect(expandButton).toHaveClass(/toggle-button--quiet/);
  await expect(expandButton).toHaveClass(/toggle-button--default/);
  await expect(expandButton).toBeEnabled();
  await expect.poll(async () => expandButton.boundingBox()).toEqual({ x: expect.any(Number), y: expect.any(Number), width: 32, height: 32 });

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
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
      marginHorizontal: field("margin-horizontal"),
      marginVertical: field("margin-vertical"),
    };
  })).toEqual({
    paddingHorizontal: { token: "1", value: "--conformance-space" },
    paddingVertical: { token: null, value: "0px" },
    marginHorizontal: { token: null, value: "0px" },
    marginVertical: { token: null, value: "1rem, 0px" },
  });

  await expandButton.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
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
