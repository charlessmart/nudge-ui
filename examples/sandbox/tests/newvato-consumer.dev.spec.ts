import { expect, test } from "@playwright/test";

type Fixture = {
  target: string;
  property: string;
  currentToken: string;
  peerToken: string;
};

const fixtures: Fixture[] = [
  {
    target: "design-tool-content-primary",
    property: "color",
    currentToken: "--color-content-primary",
    peerToken: "--color-content-secondary",
  },
  {
    target: "design-tool-spacing",
    property: "padding-top",
    currentToken: "--spacing-3x",
    peerToken: "--spacing-4x",
  },
  {
    target: "design-tool-radius",
    property: "border-radius",
    currentToken: "--roundness-4x",
    peerToken: "--roundness-5x",
  },
  {
    target: "design-tool-typography",
    property: "font-size",
    currentToken: "--font-size-title-3",
    peerToken: "--font-size-title-4",
  },
  {
    target: "design-tool-sprinkles",
    property: "background-color",
    currentToken: "--color-surface-elevated-1x",
    peerToken: "--color-surface-secondary",
  },
];

function tokenField(page: import("@playwright/test").Page, property: string) {
  return page.locator(`[data-test="token-field"][data-property="${property}"]`);
}

async function waitForField(
  page: import("@playwright/test").Page,
  property: string,
): Promise<void> {
  await expect
    .poll(async () => (await tokenField(page, property).count()) > 0)
    .toBe(true);
}

async function waitForFixture(page: import("@playwright/test").Page): Promise<void> {
  const primary = page.getByTestId("design-tool-content-primary");
  await expect(primary).toBeVisible();
  await expect(primary).toHaveAttribute("data-cid", "Text");
  await expect
    .poll(() => page.evaluate(() => document.getElementById("design-tool-root")?.shadowRoot !== null))
    .toBe(true);
}

async function suggestions(page: import("@playwright/test").Page): Promise<string[]> {
  return await page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
      .map((item) => item.textContent?.trim() ?? "");
  });
}

async function selectPeer(
  page: import("@playwright/test").Page,
  property: string,
  peerToken: string,
): Promise<void> {
  const field = tokenField(page, property);
  const chip = field.locator('[data-test="token-chip"]');
  if (await chip.count()) {
    await chip.click();
  } else {
    await field.locator('[data-test="raw-input"]').fill("");
  }

  await expect.poll(() => suggestions(page)).toEqual(
    expect.arrayContaining([expect.stringContaining(peerToken)]),
  );
  await page.evaluate((token) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    Array.from(root?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))
      ?.click();
  }, peerToken);
}

async function computed(
  page: import("@playwright/test").Page,
  target: string,
  property: string,
): Promise<string> {
  return await page.getByTestId(target).evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name);
  }, property);
}

async function managedSheet(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    return document.getElementById("design-tool-styles")?.textContent ?? "";
  });
}

test("Newvato fixture exposes the published design-system token catalog", async ({ page }) => {
  await page.goto("/__design-tool/e2e");
  await waitForFixture(page);

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const tokenModulePath = "/@id/__x00__virtual:design-tokens";
      return import(/* @vite-ignore */ tokenModulePath).then((module) => module.tokenCatalog);
    });
  }).toEqual(expect.arrayContaining([
    expect.objectContaining({ cssName: "--color-content-primary", origin: "package" }),
    expect.objectContaining({ cssName: "--spacing-3x", origin: "package" }),
    expect.objectContaining({ cssName: "--roundness-4x", origin: "package" }),
    expect.objectContaining({ cssName: "--font-size-title-3", origin: "package" }),
  ]));
});

for (const fixture of fixtures) {
  test(`Newvato ${fixture.target} resolves and swaps compatible ${fixture.property} tokens`, async ({ page }) => {
    await page.goto("/__design-tool/e2e");
    await waitForFixture(page);

    const target = page.getByTestId(fixture.target);
    await target.click();
    await waitForField(page, fixture.property);

    const field = tokenField(page, fixture.property);
    await expect(field.locator('input[aria-hidden="true"]')).toHaveValue(fixture.currentToken);

    const before = await computed(page, fixture.target, fixture.property);
    await selectPeer(page, fixture.property, fixture.peerToken);

    await expect.poll(() => managedSheet(page)).toContain(
      `${fixture.property}: var(${fixture.peerToken});`,
    );
    await expect.poll(() => computed(page, fixture.target, fixture.property)).not.toBe(before);
    await expect(target).not.toHaveAttribute("style", /.*/);
  });
}
