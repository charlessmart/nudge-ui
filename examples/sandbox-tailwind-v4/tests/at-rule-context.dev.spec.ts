import { expect, test } from "@playwright/test";
import type { CompatibilityInspection } from "@nudge-ui/compatibility";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: Tailwind's nested @supports color override wins over its fallback", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  const fixture = app.locator('[data-test="tailwind-alpha"]');
  await fixture.click({ position: { x: 5, y: 5 } });

  const field = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(field.locator('[data-test="token-chip"]')).toHaveText("--color-red-500", { timeout: 5000 });
  const indicator = field.locator('[data-test="at-rule-indicator"]');
  await expect(indicator).toHaveText("1");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"] [data-active="true"]'))
    .toHaveText("(color: color-mix(in lab, red, red))");
});

test("dev: nested interaction rules expose states only on matching elements", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  const frame = await getAppFrame(page);
  await frame.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      .nested-state-button {
        &:hover { color: red; }
        &:focus-visible { outline: 2px solid blue; }
        &:disabled { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    const fixture = document.createElement("section");
    fixture.style.padding = "128px 32px";
    fixture.innerHTML = `
      <p id="nested-plain" data-cid="NestedPlain" data-src="NestedFixture.tsx:1:1">Plain text without interaction styles</p>
      <button id="nested-button" class="nested-state-button" data-cid="NestedButton" data-src="NestedFixture.tsx:2:1">Interactive button</button>
    `;
    document.body.prepend(fixture);
  });

  await app.locator("#nested-plain").click();
  await expect(page.locator('[data-test="typography"]')).toBeVisible();
  await expect(page.locator('[data-test="style-state"]')).toBeHidden();

  await app.locator("#nested-button").click();
  await page.getByRole("combobox", { name: "Style State" }).click();
  await expect(page.getByRole("option", { name: "Hover", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Focus Visible", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Disabled", exact: true })).toBeVisible();
});

test("dev: nested descendants retain parent specificity through media rules", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  const frame = await getAppFrame(page);
  await frame.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      .nested-parent, #unused-parent {
        > .nested-child {
          @media (min-width: 0px) {
            & { color: rgb(170, 34, 51); }
          }
        }
      }
      .nested-parent > .nested-child { color: rgb(34, 51, 170); }
    `;
    document.head.appendChild(style);
    const fixture = document.createElement("section");
    fixture.className = "nested-parent";
    fixture.innerHTML = '<p id="nested-child" class="nested-child">Nested descendant</p>';
    document.body.prepend(fixture);
  });

  await expect(app.locator("#nested-child")).toHaveCSS("color", "rgb(170, 34, 51)");
  await expect.poll(async () => frame.evaluate(() => {
    const bridge = (window as Window & {
      __nudgeUi?: { inspect(selector: string): CompatibilityInspection | null };
    }).__nudgeUi;
    return bridge?.inspect("#nested-child")?.properties.find((row) => row.property === "color")?.authored;
  })).toBe("rgb(170, 34, 51)");
});
