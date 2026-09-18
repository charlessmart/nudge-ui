import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { appLocator, openEditor } from "./editor.ts";

async function selectCase(page: import("@playwright/test").Page, id: string): Promise<void> {
  await appLocator(page, `[data-test="pipeline-case-${id}"]`).click({ position: { x: 5, y: 5 } });
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
}

async function setRawInput(
  page: import("@playwright/test").Page,
  property: string,
  value: string,
): Promise<void> {
  const input = page.locator(`[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`);
  await input.fill(value);
  await input.blur();
}

function computed(
  page: import("@playwright/test").Page,
  id: string,
  property: string,
): Promise<string> {
  return appLocator(page, `[data-test="pipeline-case-${id}"]`).evaluate(
    (element, prop) => getComputedStyle(element).getPropertyValue(prop),
    property,
  );
}

test("dev: static CSS declarations remain inspectable without a token catalog", async ({ page }) => {
  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "token-color");
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="token-chip"]'))
    .toContainText("--pipeline-color");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]'))
    .toContainText("--pipeline-surface");
});

test("dev: a fallback expression remains authored and previews through the managed stylesheet", async ({ page }) => {
  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "raw-fallback-color");

  const input = page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]');
  await expect(input).toHaveValue("var(--pipeline-missing-color, rebeccapurple)");

  await setRawInput(page, "color", "#123456");
  await expect.poll(() => computed(page, "raw-fallback-color", "color")).toBe("rgb(18, 52, 86)");
  await expect.poll(() => managedSheetText(page))
    .toContain("color: rgb(18, 52, 86);");
});

test("dev: physical and logical spacing survive the static CSS pipeline", async ({ page }) => {
  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "physical-spacing");

  const horizontal = page.locator('[data-test="token-field"][data-property="padding-horizontal"] [data-test="raw-input"]');
  await expect(horizontal).toHaveValue("12px");
  await setRawInput(page, "padding-horizontal", "20px");
  await expect.poll(() => computed(page, "physical-spacing", "padding-left")).toBe("20px");
  await expect.poll(() => computed(page, "physical-spacing", "padding-right")).toBe("20px");

  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "logical-spacing");
  await expect(page.locator('[data-test="token-field"][data-property="padding-horizontal"] input[aria-hidden="true"]'))
    .toHaveValue("--pipeline-space");
});

test("dev: border, typography, and layout controls use rows from the static CSS pipeline", async ({ page }) => {
  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "simple-border");
  await expect(page.locator('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]'))
    .toHaveValue("2px");

  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "typography-shorthand");
  await expect(page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]'))
    .toHaveValue("1.25rem");

  await openEditor(page, "/pipeline-conformance");
  await selectCase(page, "flex-layout");
  await expect(page.locator('[data-test="layout-flex-container"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-gap"]')).toBeVisible();
});
