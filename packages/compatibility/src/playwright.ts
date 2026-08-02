import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  CompatibilityInspection,
  CompatibilityInvariant,
  CompatibilityManifest,
  CompatibilityScenario,
} from "./manifest.ts";
import { validateCompatibilityManifest } from "./manifest.ts";

export interface CompatibilityRun {
  inspections: Map<string, CompatibilityInspection>;
  managedPreviews: Map<string, CompatibilityManagedPreview>;
}

export interface CompatibilityManagedPreview {
  rules: CompatibilityInspection["managedPreview"]["rules"];
  result: CompatibilityInspection["managedPreview"]["results"][number];
  inlineStyleBefore: string | null;
  inlineStyleAfter: string | null;
  revertedComputed: string;
}

async function inspectionFor(page: Page, selector: string): Promise<CompatibilityInspection | null> {
  return page.evaluate((target) => {
    const bridge = (window as unknown as {
      __designTool?: { inspect(value: string): CompatibilityInspection | null };
    }).__designTool;
    return bridge?.inspect(target) ?? null;
  }, selector);
}

function propertyOf(inspection: CompatibilityInspection, property: string) {
  return inspection.properties.find((candidate) => candidate.property === property);
}

function controlOf(inspection: CompatibilityInspection, property: string) {
  return inspection.controls.find((candidate) => candidate.property === property);
}

async function callAction(page: Page, action: CompatibilityScenario["beforeInspect"]): Promise<void> {
  if (!action) return;
  await page.evaluate((name) => {
    const hook = (window as unknown as Record<string, unknown>)[name];
    if (typeof hook !== "function") throw new Error(`Compatibility hook ${name} is not a function`);
    hook();
  }, action.name);
}

async function selectToken(page: Page, property: string, token: string): Promise<void> {
  const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
  await expect(field).toBeAttached();
  await field.locator('[data-test="token-chip"]').click();
  await expect.poll(async () => page.evaluate((name) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
      .some((item) => item.textContent?.includes(name));
  }, token)).toBe(true);
  await page.evaluate((name) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const item = Array.from(root?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((candidate) => candidate.textContent?.includes(name));
    if (!item) throw new Error(`Missing token suggestion ${name}`);
    item.click();
  }, token);
}

async function revertProperty(page: Page, property: string): Promise<void> {
  const changes = page.locator('[data-test="changes-log"]');
  const open = await changes.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!open) await changes.locator('[data-test="changes-toggle"]').click();
  const revert = page.locator(`[data-test="change-row"][data-property="${property}"] [data-test="change-revert"]`);
  await expect(revert).toBeAttached();
  await revert.click();
}

async function assertScenario(page: Page, scenario: CompatibilityScenario): Promise<{
  inspection: CompatibilityInspection;
  managedPreview?: CompatibilityManagedPreview;
}> {
  await page.goto(scenario.path ?? "/");
  await expect(page.locator(scenario.selector)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __designTool?: { version: number };
  }).__designTool?.version ?? null)).toBe(1);
  await callAction(page, scenario.beforeInspect);
  await expect(page.locator(scenario.selector)).toBeVisible();

  let inspection: CompatibilityInspection | null = null;
  await expect.poll(async () => {
    inspection = await inspectionFor(page, scenario.selector);
    return inspection;
  }).not.toBeNull();
  const actual = inspection!;

  for (const expected of scenario.catalog ?? []) {
    const entry = actual.catalog.find((candidate) => candidate.name === expected.name);
    expect(
      entry,
      `${scenario.id}: catalog ${expected.name}; available: ${actual.catalog.map((candidate) => `${candidate.name}=${candidate.cssName}`).join(", ")}`,
    ).toBeDefined();
    if (expected.adapter !== undefined) expect(entry?.adapter).toBe(expected.adapter);
    if (expected.cssNamePattern !== undefined) expect(entry?.cssName).toMatch(new RegExp(expected.cssNamePattern));
    if (expected.declaration !== undefined) {
      const declaration = entry?.declarations.find((candidate) => candidate.value === expected.declaration!.value);
      expect(declaration, `${scenario.id}: declaration ${expected.name}=${expected.declaration.value}`).toBeDefined();
      if (expected.declaration.sourcePattern !== undefined) {
        expect(declaration?.source).toMatch(new RegExp(expected.declaration.sourcePattern));
      }
      if (expected.declaration.selectorPattern !== undefined) {
        expect(declaration?.context.selector).toMatch(new RegExp(expected.declaration.selectorPattern));
      }
    }
  }
  for (const expected of scenario.properties) {
    const property = propertyOf(actual, expected.property);
    expect(property, `${scenario.id}: property ${expected.property}`).toBeDefined();
    if (expected.authored !== undefined) expect(property?.authored).toBe(expected.authored);
    if (expected.authoredPattern !== undefined) expect(property?.authored).toMatch(new RegExp(expected.authoredPattern));
    if (expected.computed !== undefined) expect(property?.computed).toBe(expected.computed);
    if (expected.token !== undefined) expect(property?.tokenName).toBe(expected.token);
    if (expected.tokens !== undefined) expect(property?.tokens?.map((token) => token.name)).toEqual(expected.tokens);
    if (expected.capability !== undefined) expect(property?.capability).toBe(expected.capability);
    if (expected.confidence !== undefined) expect(property?.confidence).toBe(expected.confidence);
  }
  for (const expected of scenario.controls ?? []) {
    const control = controlOf(actual, expected.property);
    expect(control, `${scenario.id}: control ${expected.property}`).toBeDefined();
    if (expected.kind !== undefined) expect(control?.kind).toBe(expected.kind);
    if (expected.activeToken !== undefined) expect(control?.activeToken).toBe(expected.activeToken);
    if (expected.suggestionsContain !== undefined) expect(control?.suggestions).toEqual(expect.arrayContaining(expected.suggestionsContain));
  }

  if (scenario.edit) {
    const before = getComputedStyleValue(actual, scenario.edit.property);
    const inlineStyleBefore = await page.locator(scenario.selector).getAttribute("style");
    await page.locator(scenario.selector).click();
    await selectToken(page, scenario.edit.property, scenario.edit.selectToken);
    await expect.poll(() => page.locator(scenario.selector).evaluate((element, property) =>
      getComputedStyle(element).getPropertyValue(property).trim(), scenario.edit!.property))
      .toBe(scenario.edit.computedAfter);
    await expect.poll(async () => (await inspectionFor(page, scenario.selector))?.prompt ?? null).not.toBeNull();
    const edited = (await inspectionFor(page, scenario.selector))!;
    for (const text of scenario.edit.promptContains) expect(edited.prompt).toContain(text);
    const selectedToken = edited.catalog.find((entry) => entry.name === scenario.edit!.selectToken);
    expect(selectedToken, `${scenario.id}: selected token catalog entry`).toBeDefined();
    const tokenReference = `var(${selectedToken!.cssName})`;
    const frozenTokenValue = await page.locator(scenario.selector).evaluate((element, cssName) =>
      getComputedStyle(element).getPropertyValue(cssName).trim(), selectedToken!.cssName);
    const previewResult = edited.managedPreview.results.find((result) =>
      result.property === scenario.edit!.property);
    expect(
      [tokenReference, frozenTokenValue],
      `${scenario.id}: preview value represents selected token`,
    ).toContain(previewResult?.requestedValue);
    const managedRule = edited.managedPreview.rules.find((rule) =>
      rule.declarations[scenario.edit!.property] === previewResult?.requestedValue);
    expect(
      managedRule,
      `${scenario.id}: managed rule ${scenario.edit.property}=${previewResult?.requestedValue}`,
    ).toBeDefined();
    expect(previewResult, `${scenario.id}: managed preview result`).toMatchObject({
      property: scenario.edit.property,
      computedValue: scenario.edit.computedAfter,
      status: "applied",
    });
    const inlineStyleAfter = await page.locator(scenario.selector).getAttribute("style");
    expect(inlineStyleAfter, `${scenario.id}: tracked element inline style`).toBe(inlineStyleBefore);
    const changeRow = page.locator(`[data-test="change-row"][data-property="${scenario.edit.property}"]`);
    await expect(changeRow).toHaveCount(1);
    await expect(changeRow).toContainText(scenario.edit.selectToken);
    await revertProperty(page, scenario.edit.property);
    await expect.poll(() => page.locator(scenario.selector).evaluate((element, property) =>
      getComputedStyle(element).getPropertyValue(property).trim(), scenario.edit!.property))
      .toBe(scenario.edit.revertTo || before);
    await expect(changeRow).toHaveCount(0);
    return {
      inspection: actual,
      managedPreview: {
        rules: edited.managedPreview.rules,
        result: previewResult!,
        inlineStyleBefore,
        inlineStyleAfter,
        revertedComputed: scenario.edit.revertTo || before,
      },
    };
  }

  return { inspection: actual };
}

function getComputedStyleValue(inspection: CompatibilityInspection, property: string): string {
  return propertyOf(inspection, property)?.computed ?? "";
}

function assertInvariant(
  invariant: CompatibilityInvariant,
  inspections: Map<string, CompatibilityInspection>,
): void {
  const left = inspections.get(invariant.left);
  const right = inspections.get(invariant.right);
  expect(left, `${invariant.id}: left inspection`).toBeDefined();
  expect(right, `${invariant.id}: right inspection`).toBeDefined();
  const leftProperty = propertyOf(left!, invariant.property);
  const rightProperty = propertyOf(right!, invariant.property);
  for (const field of invariant.equal) {
    expect(rightProperty?.[field], `${invariant.id}: ${field}`).toEqual(leftProperty?.[field]);
  }
  if (invariant.equalSuggestions) {
    expect(controlOf(right!, invariant.property)?.suggestions).toEqual(controlOf(left!, invariant.property)?.suggestions);
  }
}

/** Runs one fixture's complete data-led compatibility contract. */
export async function runCompatibilityManifest(
  page: Page,
  manifest: CompatibilityManifest,
): Promise<CompatibilityRun> {
  expect(validateCompatibilityManifest(manifest)).toEqual([]);
  const inspections = new Map<string, CompatibilityInspection>();
  const managedPreviews = new Map<string, CompatibilityManagedPreview>();
  for (const scenario of manifest.scenarios) {
    const result = await assertScenario(page, scenario);
    inspections.set(scenario.id, result.inspection);
    if (result.managedPreview) managedPreviews.set(scenario.id, result.managedPreview);
  }
  for (const invariant of manifest.invariants ?? []) assertInvariant(invariant, inspections);
  return { inspections, managedPreviews };
}
