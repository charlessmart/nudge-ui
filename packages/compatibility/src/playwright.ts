import { expect } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import type {
  CompatibilityInspection,
  CompatibilityInvariant,
  CompatibilityManifest,
  CompatibilityScenario,
} from "./manifest.ts";
import { validateCompatibilityManifest } from "./manifest.ts";
import { CSS_LIBRARY_CORPUS_PROPERTIES } from "./manifest.ts";

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

type ApplicationSurface = Page | Frame;

async function applicationSurface(page: Page): Promise<ApplicationSurface> {
  if (!await page.locator("html[data-nudge-ui-editor]").count()) return page;
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").not.toBe("");
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Nudge UI preview frame did not become ready");
  await expect(frame.locator("body")).toBeVisible();
  return frame;
}

async function inspectionFor(app: ApplicationSurface, selector: string): Promise<CompatibilityInspection | null> {
  return app.evaluate((target) => {
    const bridge = (window as Window & {
      __nudgeUi?: { inspect(value: string): CompatibilityInspection | null };
    }).__nudgeUi;
    return bridge?.inspect(target) ?? null;
  }, selector);
}

function propertyOf(inspection: CompatibilityInspection, property: string) {
  return inspection.properties.find((candidate) => candidate.property === property);
}

function controlOf(inspection: CompatibilityInspection, property: string) {
  return inspection.controls.find((candidate) => candidate.property === property);
}

async function callAction(app: ApplicationSurface, action: CompatibilityScenario["beforeInspect"]): Promise<void> {
  if (!action) return;
  await app.evaluate((name) => {
    const hook = Reflect.get(window, name);
    if (typeof hook !== "function") throw new Error(`Compatibility hook ${name} is not a function`);
    hook();
  }, action.name);
}

async function selectToken(page: Page, property: string, token: string): Promise<void> {
  const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
  await expect(field).toBeAttached();
  await field.locator('[data-test="token-chip"]').click();
  await expect.poll(async () => page.evaluate((name) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
      .some((item) => item.textContent?.includes(name));
  }, token)).toBe(true);
  await page.evaluate((name) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
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
  const app = await applicationSurface(page);
  await expect(app.locator(scenario.selector)).toBeVisible();
  await expect.poll(() => app.evaluate(() => (window as Window & {
    __nudgeUi?: { version: number };
  }).__nudgeUi?.version ?? null)).toBe(1);
  await callAction(app, scenario.beforeInspect);
  await expect(app.locator(scenario.selector)).toBeVisible();

  let inspection: CompatibilityInspection | null = null;
  await expect.poll(async () => {
    inspection = await inspectionFor(app, scenario.selector);
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
  if (scenario.caseId) {
    const corpusProperty = propertyOf(actual, CSS_LIBRARY_CORPUS_PROPERTIES[scenario.caseId]);
    expect(corpusProperty?.authored, `${scenario.id}: corpus authored value`).toBeTruthy();
    expect(corpusProperty?.computed, `${scenario.id}: corpus computed value`).toBeTruthy();
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
    const inlineStyleBefore = await app.locator(scenario.selector).getAttribute("style");
    await app.locator(scenario.selector).click();
    await selectToken(page, scenario.edit.property, scenario.edit.selectToken);
    await expect.poll(() => app.locator(scenario.selector).evaluate((element, property) =>
      getComputedStyle(element).getPropertyValue(property).trim(), scenario.edit!.property))
      .toBe(scenario.edit.computedAfter);
    await expect.poll(async () => (await inspectionFor(app, scenario.selector))?.prompt ?? null).not.toBeNull();
    const edited = (await inspectionFor(app, scenario.selector))!;
    for (const text of scenario.edit.promptContains) expect(edited.prompt).toContain(text);
    const selectedToken = edited.catalog.find((entry) => entry.name === scenario.edit!.selectToken);
    expect(selectedToken, `${scenario.id}: selected token catalog entry`).toBeDefined();
    const tokenReference = `var(${selectedToken!.cssName})`;
    const frozenTokenValue = await app.locator(scenario.selector).evaluate((element, cssName) =>
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
    const inlineStyleAfter = await app.locator(scenario.selector).getAttribute("style");
    expect(inlineStyleAfter, `${scenario.id}: tracked element inline style`).toBe(inlineStyleBefore);
    const changeRow = page.locator(`[data-test="change-row"][data-property="${scenario.edit.property}"]`);
    await expect(changeRow).toHaveCount(1);
    await expect(changeRow).toContainText(scenario.edit.selectToken);
    await revertProperty(page, scenario.edit.property);
    await expect.poll(() => app.locator(scenario.selector).evaluate((element, property) =>
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

/** Shared ADR-0002 runtime contract for every standalone production preview. */
export async function assertProductionContract(page: Page): Promise<void> {
  const facts = await page.evaluate(() => ({
    identityAttributes: document.querySelectorAll("[data-cid], [data-src], [data-cprops]").length,
    dataAttributes: Array.from(document.querySelectorAll("*")).reduce(
      (count, element) => count + Array.from(element.attributes).filter((attribute) => attribute.name.startsWith("data-")).length,
      0,
    ),
    dataAttributeDetails: Array.from(document.querySelectorAll("*")).flatMap((element) =>
      Array.from(element.attributes)
        .filter((attribute) => attribute.name.startsWith("data-"))
        .map((attribute) => `${attribute.name}=${attribute.value}`)),
    inspectorRoot: document.querySelectorAll("#nudge-ui-root").length,
    inspectorShell: document.querySelectorAll("[data-test^='inspector'], [data-test='canvas-host']").length,
    managedStylesheet: document.querySelectorAll("#nudge-ui-styles").length,
    runtimeState: ["__nudgeUi", "__designTokens", "__designTokenCatalog", "__designTokenDiagnostics"]
      .some((key) => key in window),
    html: document.documentElement.outerHTML,
    scripts: Array.from(document.scripts).map((script) => script.src),
  }));
  expect(facts.identityAttributes, "production identity attributes").toBe(0);
  expect(facts.dataAttributes, `production data attributes: ${facts.dataAttributeDetails.join(", ")}`).toBe(0);
  expect(facts.inspectorRoot, "production Inspector root").toBe(0);
  expect(facts.inspectorShell, "production Inspector/Canvas shell").toBe(0);
  expect(facts.managedStylesheet, "production managed stylesheet").toBe(0);
  expect(facts.runtimeState, "production Nudge UI runtime state").toBe(false);
  expect(facts.html).not.toContain("virtual:nudge-ui-inspector");
  expect(facts.html).not.toContain("virtual:design-tokens");
  expect(facts.html).not.toContain("__nudgeUi");
  expect(facts.scripts.some((src) => src.includes("/@id/") || src.includes("nudge-ui-inspector"))).toBe(false);
}
