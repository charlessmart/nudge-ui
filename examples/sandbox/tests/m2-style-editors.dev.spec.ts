import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
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

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Boolean(document.getElementById("design-tool-root")?.shadowRoot?.querySelector('[data-test="inspect-tab"]'))), { timeout: 5000 })
    .toBe(true);
}

async function expandSpacing(page: import("@playwright/test").Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!raw) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, v);
    raw.dispatchEvent(new Event("change", { bubbles: true }));
    raw.blur();
  }, { p: property, v: value });
}

async function computedProp(page: import("@playwright/test").Page, prop: string): Promise<string> {
  return await page.evaluate((p) => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).getPropertyValue(p) : "";
  }, prop);
}

async function computedFixtureProp(page: import("@playwright/test").Page, fixture: string, prop: string): Promise<string> {
  return await page.locator(`[data-test="${fixture}"]`).evaluate((element, property) => {
    return getComputedStyle(element).getPropertyValue(property);
  }, prop);
}

test("dev: style editors write through the managed stylesheet and update the .btn live", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);
  await expandSpacing(page);

  await setInput(page, "padding-top", "24px");
  await expect
    .poll(async () => computedProp(page, "padding-top"), { timeout: 5000 })
    .toBe("24px");

  await setInput(page, "font-size", "18px");
  await expect
    .poll(async () => computedProp(page, "font-size"), { timeout: 5000 })
    .toBe("18px");

  await setInput(page, "border-radius", "12px");
  await expect
    .poll(async () => computedProp(page, "border-radius"), { timeout: 5000 })
    .toBe("12px");

  const expectedColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim(),
  );
  const expectedRgb = hexToRgbString(expectedColor);

  const hasColorChip = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Boolean(sr?.querySelector('[data-test="token-field"][data-property="color"] [data-test="token-chip"]'));
  });
  if (hasColorChip) {
    await page.locator('[data-test="token-field"][data-property="color"] [data-test="token-chip"]').click();
  } else {
    await page.evaluate((value) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(
      '[data-test="token-field"][data-property="color"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!raw) throw new Error("Missing color editor");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, "");
    raw.dispatchEvent(new Event("input", { bubbles: true }));
  }, "--color-text-secondary");
  }
  await expect
    .poll(async () => page.evaluate((token) => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, "--color-text-secondary"), { timeout: 5000 })
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))?.click();
  }, "--color-text-secondary");
  await expect
    .poll(async () => computedProp(page, "color"), { timeout: 5000 })
    .toContain(expectedRgb ?? expectedColor);

  const sheet = await sheetText(page);
  await expect
    .poll(async () => {
      const text = await sheetText(page);
      return text.includes('[data-cid="Button"]')
        && /\[data-src="src\/Button\.tsx:\d+:\d+"\]/.test(text)
        && text.includes("padding-top: 24px")
        && text.includes("font-size: 18px")
        && text.includes("border-radius: 12px")
        && text.includes("color: var(--color-text-secondary);");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: color suggestions exclude unrelated tokens from the editor picker", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  await expect.poll(async () => page.evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: Array<{ cssName: string }>;
    }).__designTokenCatalog;
    return catalog?.some((token) => token.cssName === "--color-danger") ?? false;
  })).toBe(true);

  const color = page.locator('[data-test="token-field"][data-property="color"]');
  const colorPicker = page.locator('[data-test="color-picker"][data-property="color"]');
  const chip = color.locator('[data-test="token-chip"]');
  const raw = color.locator('[data-test="raw-input"]');
  const addColor = colorPicker.locator('[data-test="add-color"]');
  await expect.poll(async () => (await chip.count()) + (await raw.count()) + (await addColor.count()))
    .toBeGreaterThan(0);
  if (await chip.count()) await chip.click();
  else if (await raw.count()) await raw.fill("");
  else {
    await addColor.click();
    await color.locator('[data-test="raw-input"]').fill("");
  }

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
      .map((item) => item.textContent?.trim() ?? "");
  })).not.toContain("--color-danger");

});

test("dev: linked border values expand into icon-labelled individual side fields", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  const borderSection = page.locator('.dt-border');
  await expect(borderSection).toHaveAttribute("data-expanded", "false");
  await expect(borderSection.locator('[data-test="token-field"][data-property="border-width"]')).toHaveCount(1);
  await expect(borderSection.locator('[data-test="border-expand"]')).toHaveClass(/dt-toggle-button/);
  await expect(borderSection.locator('[data-test="border-expand"]')).toHaveClass(/dt-toggle-button--quiet/);
  await expect(borderSection.locator('.dt-border__linked-row')).toHaveCount(1);

  await borderSection.locator('[data-test="border-expand"]').click();
  await expect(borderSection).toHaveAttribute("data-expanded", "true");
  await expect(borderSection.locator('[data-test="border-side-rows"] [data-side="top"]')).toHaveCount(1);
  await expect(borderSection.locator('[data-test="token-field"][data-property="border-top-width"]')).toHaveCount(1);

  await setInput(page, "border-top-width", "2px");
  await expect
    .poll(async () => computedProp(page, "border-top-width"), { timeout: 5000 })
    .toBe("2px");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("border-top-width: 2px");
});

test("dev: authored CSS border fixtures parse width, style, and color per side", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);
  const fixture = page.locator('[data-test="css-border-mixed"]');
  await fixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);

  await expect(page.locator('.dt-border')).toHaveAttribute("data-expanded", "true");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("2px");
  await expect(page.locator('[data-test="token-field"][data-property="border-bottom-width"] [data-test="raw-input"]')).toHaveValue("4px");
  await expect(page.locator('[data-test="border-style-top"]')).toHaveAttribute("data-current-style", "dashed");
  await expect(page.locator('[data-test="border-style-bottom"]')).toHaveAttribute("data-current-style", "double");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-color"] [data-test="token-chip"]')).toContainText("--color-accent");

  await setInput(page, "border-right-width", "5px");
  await expect
    .poll(async () => computedFixtureProp(page, "css-border-mixed", "border-right-width"), { timeout: 5000 })
    .toBe("5px");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("border-right-width: 5px");
});

test("dev: main demo color fixtures expose partial opacity after CSSOM normalization", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  const rgbaFixture = page.locator('[data-test="css-opacity-rgba"]');
  await rgbaFixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("rgba(196, 243, 107, 0.18)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("18%");

  const hexFixture = page.locator('[data-test="css-opacity-hex"]');
  await hexFixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("rgba(217, 200, 255, 0.2)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("20%");
});

test("dev: individual side focus ring belongs to the whole side field", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);
  await page.locator('[data-test="css-border-mixed"]').evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);

  const input = page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]');
  await input.focus();
  const readFocusStyles = () => page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = shadow?.querySelector('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]') as HTMLElement | null;
    const side = raw?.closest('[data-test^="side-value-"]') as HTMLElement | null;
    return {
      sideBoxShadow: side ? getComputedStyle(side).boxShadow : "",
      inputBoxShadow: raw ? getComputedStyle(raw).boxShadow : "",
    };
  });
  await expect.poll(readFocusStyles, { timeout: 5000 }).toMatchObject({ inputBoxShadow: "none" });
  const focusStyles = await readFocusStyles();

  expect(focusStyles.sideBoxShadow).not.toBe("none");
});

test("dev: spacing starts grouped and toggles between pair and four-side views", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  const spacing = page.locator('[data-test="spacing-padding"]');
  await expect(spacing).toHaveAttribute("data-expanded", "false");
  await expect(spacing.locator('[data-test^="pair-value-"]')).toHaveCount(2);
  await expect(spacing.locator('[data-test^="side-value-"]')).toHaveCount(0);

  const iconStyles = await page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    const readIcon = (group: "padding" | "margin", axis: "horizontal" | "vertical") => {
      const svg = shadow?.querySelector(`[data-test="spacing-${group}"] [data-test="pair-value-${axis}"] svg`) as SVGSVGElement | null;
      const rect = svg?.querySelector("rect");
      return {
        viewBox: svg?.getAttribute("viewBox"),
        width: svg ? getComputedStyle(svg).width : "",
        height: svg ? getComputedStyle(svg).height : "",
        color: svg ? getComputedStyle(svg).color : "",
        rectX: rect?.getAttribute("x"),
        rectTransform: rect?.getAttribute("transform"),
        stroke: rect?.getAttribute("stroke"),
      };
    };
    return {
      paddingHorizontal: readIcon("padding", "horizontal"),
      paddingVertical: readIcon("padding", "vertical"),
      marginHorizontal: readIcon("margin", "horizontal"),
      marginVertical: readIcon("margin", "vertical"),
    };
  });
  expect(iconStyles).toMatchObject({
    paddingHorizontal: { viewBox: "0 0 24 24", width: "16px", height: "16px", color: "rgb(111, 111, 111)", rectX: "3", stroke: "currentColor" },
    paddingVertical: { rectTransform: "rotate(90 21 3)" },
    marginHorizontal: { rectX: "6" },
    marginVertical: { rectTransform: "rotate(90 19 6)" },
  });

  await setInput(page, "padding-horizontal", "20px");
  await expect.poll(() => computedProp(page, "padding-left"), { timeout: 5000 }).toBe("20px");
  await expect.poll(() => computedProp(page, "padding-right"), { timeout: 5000 }).toBe("20px");
  await expect.poll(() => sheetText(page), { timeout: 5000 }).toContain("padding-left: 20px");
  await expect.poll(() => sheetText(page), { timeout: 5000 }).toContain("padding-right: 20px");

  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
  await expect(spacing.locator('[data-test^="side-value-"]')).toHaveCount(4);

  const individualIconStyles = await page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    const readIcon = (side: "left" | "right" | "bottom" | "top") => {
      const svg = shadow?.querySelector(`[data-test="spacing-padding"] [data-side="${side}"] svg`) as SVGSVGElement | null;
      const rect = svg?.querySelector("rect");
      const line = svg?.querySelector("line");
      return {
        viewBox: svg?.getAttribute("viewBox"),
        width: svg ? getComputedStyle(svg).width : "",
        height: svg ? getComputedStyle(svg).height : "",
        color: svg ? getComputedStyle(svg).color : "",
        rectTransform: rect?.getAttribute("transform"),
        lineX1: line?.getAttribute("x1"),
        stroke: rect?.getAttribute("stroke"),
      };
    };
    return {
      left: readIcon("left"),
      right: readIcon("right"),
      bottom: readIcon("bottom"),
      top: readIcon("top"),
    };
  });
  expect(individualIconStyles).toMatchObject({
    left: { viewBox: "0 0 24 24", width: "16px", height: "16px", color: "rgb(111, 111, 111)", lineX1: "6.75", stroke: "currentColor" },
    right: { lineX1: "17" },
    bottom: { rectTransform: "rotate(90 21 3)" },
    top: { rectTransform: "rotate(-90 3 21)" },
  });

  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "false");
  await expect(spacing.locator('[data-test^="pair-value-"]')).toHaveCount(2);

  const margin = page.locator('[data-test="spacing-margin"]');
  await margin.locator('[data-test="individual-sides"]').click();
  await expect(margin).toHaveAttribute("data-expanded", "true");
  const marginIconStyles = await page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    const readIcon = (side: "left" | "right" | "top" | "bottom") => {
      const svg = shadow?.querySelector(`[data-test="spacing-margin"] [data-side="${side}"] svg`) as SVGSVGElement | null;
      const rect = svg?.querySelector("rect");
      return {
        rectX: rect?.getAttribute("x"),
        rectTransform: rect?.getAttribute("transform"),
        lineX1: svg?.querySelector("line")?.getAttribute("x1"),
        stroke: rect?.getAttribute("stroke"),
      };
    };
    return { left: readIcon("left"), right: readIcon("right"), top: readIcon("top"), bottom: readIcon("bottom") };
  });
  expect(marginIconStyles).toMatchObject({
    left: { rectX: "7", lineX1: "3", stroke: "currentColor" },
    right: { rectX: "3", lineX1: "21" },
    top: { rectTransform: "rotate(90 19 7)", lineX1: "19" },
    bottom: { rectTransform: "rotate(90 19 3)", lineX1: "19" },
  });
});

test("dev: linking divergent border widths applies one value and survives reselection", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);
  const fixture = page.locator('[data-test="css-border-mixed"]');
  await fixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);

  const borderSection = page.locator('.dt-border');
  await expect(borderSection).toHaveAttribute("data-expanded", "true");
  await borderSection.locator('[data-test="border-collapse"]').click();
  await expect(borderSection).toHaveAttribute("data-expanded", "false");
  await expect
    .poll(async () => Promise.all(["top", "right", "bottom", "left"].map((side) => computedFixtureProp(page, "css-border-mixed", `border-${side}-width`))), { timeout: 5000 })
    .toEqual(["2px", "2px", "2px", "2px"]);
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("border-width: 2px");

  await fixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);
  await expect(page.locator('.dt-border')).toHaveAttribute("data-expanded", "false");
});

test("dev: style editors keep layout and spacing ahead of typography and color", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  const editorOrder = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="style-editors"] > .dt-editor') ?? [])
      .map((editor) => editor.getAttribute("data-test"));
  });

  expect(editorOrder).toEqual([
    "layout-section",
    "spacing-box",
    "layout-inset",
    "typography",
    "color-picker",
    "color-picker",
    "border-editor",
    "border-radius-editor",
    "box-shadow-editor",
  ]);

  await expect(page.locator('[data-test="border-editor"] .dt-editor__title')).toHaveText("Border");
  await expect(page.locator('[data-test="border-radius-editor"] .dt-editor__title')).toHaveText("Border Radius");
  await expect(page.locator('[data-test="box-shadow-editor"] .dt-editor__title')).toHaveText("Box Shadow");

  const colorEditors = page.locator('[data-test="color-picker"]');
  await expect(colorEditors.nth(0).locator(".dt-editor__title")).toHaveText("Color");
  await expect(colorEditors.nth(1).locator(".dt-editor__title")).toHaveText("Background Color");
  await expect(colorEditors.locator('[data-test="color-swatch"]')).toHaveCount(0);
  await expect(colorEditors.locator('[data-test="color-computed"]')).toHaveCount(0);
  await expect(colorEditors.nth(0)).not.toContainText("Value");
  await expect(colorEditors.nth(0).locator('[data-test="token-field"]')).toHaveClass(/dt-token-field--color/);

  await page.locator(".hero h1").click();
  await waitForEditors(page);
  const emptyBackground = page.locator('[data-test="color-picker"][data-property="background-color"]');
  await expect(emptyBackground.locator('[data-test="token-field"]')).toHaveCount(0);
  await expect(emptyBackground.locator('.dt-editor__title-row [data-test="add-color"]')).toHaveClass(/dt-icon-button--quiet/);
  await emptyBackground.locator('[data-test="add-color"]').click();
  await expect(emptyBackground.locator('[data-test="token-field"]')).toBeVisible();
  await expect(emptyBackground.locator('[data-test="raw-input"]')).toHaveValue("");

  const emptyBorder = page.locator('[data-test="border-editor"]');
  await expect(emptyBorder.locator('.dt-editor__title-row [data-test="add-border"]')).toHaveClass(/dt-icon-button--quiet/);
  await expect(emptyBorder.locator('.dt-border')).toHaveCount(0);
});

test("dev: removing a background color hides the transparent empty state", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hero-actions .btn").click();
  await waitForEditors(page);

  const background = page.locator('[data-test="color-picker"][data-property="background-color"]');
  await expect(background.locator('[data-test="remove-color"]')).toBeVisible();
  await background.locator('[data-test="remove-color"]').click();

  await expect.poll(async () => background.locator('[data-test="token-field"]').count(), { timeout: 5000 })
    .toBe(0);
  await expect(background.locator('[data-test="add-color"]')).toBeVisible();
});

test("dev: spacing fields split a three-value margin shorthand by side", async ({ page }) => {
  await page.goto("/");
  await page.click(".hero h1");
  await waitForEditors(page);
  await expect(page.locator('[data-test="spacing-margin"]')).toHaveAttribute("data-expanded", "true");
  await expect(page.locator('[data-test="spacing-margin"] [data-test="individual-sides"]')).toBeDisabled();

  await expect(page.locator('[data-test="token-field"][data-property="margin-top"] [data-test="raw-input"]')).toHaveValue("26px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-right"] [data-test="raw-input"]')).toHaveValue("0px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-bottom"] [data-test="raw-input"]')).toHaveValue("22px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-left"] [data-test="raw-input"]')).toHaveValue("0px");
});

test("dev: spacing expansion resets when selecting a symmetric element", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hero h1").click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="spacing-margin"]')).toHaveAttribute("data-expanded", "true");

  await page.locator(".btn").first().click();
  await expect(page.locator('[data-test="spacing-padding"]')).toHaveAttribute("data-expanded", "false");
  await expect(page.locator('[data-test="spacing-margin"]')).toHaveAttribute("data-expanded", "false");
  await expect(page.locator('[data-test="spacing-margin"] [data-test="pair-value-horizontal"]')).toBeVisible();
});

function hexToRgbString(raw: string): string | null {
  const match = /#([0-9a-fA-F]{6})/.exec(raw);
  if (!match) return null;
  const hex = match[1]!;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
