import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";
import { buildTokenCatalogRows } from "../tokens/catalog.ts";
import type { EditCapability, ResolvedProperty, TokenOrigin } from "../tokens/resolution.ts";
import { applyRules, verifyPreview } from "../managedStylesheet.ts";
import type { PreviewResult } from "../managedStylesheet.ts";
import { projectInspectorValues, type InspectorProjection, type ProjectionAxis, type ProjectionGroup, type ProjectionSide, type ProjectionState } from "../spacing/projection.ts";
import { createBrowserCssInspection } from "../inspection/browserCssInspection.ts";

export interface ConformancePropertyExpectation {
  authored: string;
  tokens?: string[];
  opacity?: string;
  opacityToken?: string | null;
  computed?: string;
  capability: EditCapability;
  confidence?: "exact" | "probable" | "unknown";
  structure?: Partial<Pick<NonNullable<ResolvedProperty["structure"]>, "width" | "style" | "color">>;
}

export interface ConformanceProjectionFieldExpectation {
  authoredValue?: string;
  value: string;
  tokenName?: string | null;
  sourceProperty?: string;
}

export interface ConformanceProjectionExpectation {
  spacing: Partial<Record<ProjectionGroup, {
    linked?: boolean;
    axes?: Partial<Record<ProjectionAxis, { state: ProjectionState }>>;
    fields: Partial<Record<ProjectionSide, ConformanceProjectionFieldExpectation>>;
  }>>;
}

export interface ConformanceFixture {
  id: string;
  css: string;
  markup: string;
  selected: string;
  catalog: TokenDefinition[];
  expected: {
    catalog: Array<{ name: string; value?: string; adapter?: string; origin?: TokenOrigin }>;
    properties: Record<string, ConformancePropertyExpectation>;
    projection?: ConformanceProjectionExpectation;
    preview?: { property: string; value: string; computed?: string };
  };
}

export interface ConformanceResult {
  fixture: string;
  selected: HTMLElement;
  catalog: ReturnType<typeof buildTokenCatalogRows>;
  properties: ResolvedProperty[];
  projection: InspectorProjection;
  preview: PreviewResult | null;
  cleanup(): void;
}

/**
 * Mounts one data-led fixture and runs it through the same CSSOM resolver used
 * by the inspector. The caller owns assertions; this module only owns setup,
 * teardown, and the public inspection result.
 */
export function runConformanceFixture(
  fixture: ConformanceFixture,
  doc: Document = document,
): ConformanceResult {
  const style = doc.createElement("style");
  style.dataset.conformanceFixture = fixture.id;
  style.textContent = fixture.css;
  doc.head.appendChild(style);

  const mount = doc.createElement("div");
  mount.dataset.conformanceFixture = fixture.id;
  mount.innerHTML = fixture.markup;
  doc.body.appendChild(mount);
  const selected = mount.querySelector<HTMLElement>(fixture.selected);
  if (!selected) throw new Error(`Conformance fixture ${fixture.id} selected no element: ${fixture.selected}`);

  const rows = buildTokenCatalogRows(fixture.catalog, doc.documentElement);
  const inspection = createBrowserCssInspection({
    document: doc,
    tokenKnowledge: {
      definitions: fixture.catalog,
      entries: fixture.catalog.map((definition): TokenEntry => ({
        name: definition.name,
        cssName: definition.cssName,
        value: definition.declarations[0]?.value ?? "",
        source: definition.declarations[0]?.source ?? "",
        adapter: definition.adapter,
        origin: definition.origin,
        editable: definition.editable,
      })),
      generation: fixture.id,
    },
  });
  const properties: ResolvedProperty[] = [...inspection.inspect(selected).properties];
  const projection = projectInspectorValues(selected, properties);

  let preview: PreviewResult | null = null;
  if (fixture.expected.preview) {
    applyRules([{ selector: fixture.selected, declarations: { [fixture.expected.preview.property]: fixture.expected.preview.value } }]);
    preview = verifyPreview(selected, fixture.expected.preview.property, fixture.expected.preview.value);
  }

  return {
    fixture: fixture.id,
    selected,
    catalog: rows,
    properties,
    projection,
    preview,
    cleanup() {
      inspection.dispose();
      style.remove();
      mount.remove();
      if (doc.getElementById("design-tool-styles")) doc.getElementById("design-tool-styles")?.remove();
    },
  };
}

export function assertConformanceFixture(result: ConformanceResult, fixture: ConformanceFixture): string[] {
  const failures: string[] = [];
  for (const expected of fixture.expected.catalog) {
    const row = result.catalog.find((candidate) => candidate.definition.name === expected.name || candidate.definition.cssName === expected.name);
    if (!row) failures.push(`${fixture.id}: missing catalog entry ${expected.name}`);
    if (row && expected.value !== undefined && row.authoredValue !== expected.value) failures.push(`${fixture.id}: catalog ${expected.name} authored value was ${row.authoredValue}, expected ${expected.value}`);
    if (row && expected.adapter !== undefined && row.definition.adapter !== expected.adapter) failures.push(`${fixture.id}: catalog ${expected.name} adapter was ${row.definition.adapter}, expected ${expected.adapter}`);
    if (row && expected.origin !== undefined && row.definition.origin !== expected.origin) failures.push(`${fixture.id}: catalog ${expected.name} origin was ${row.definition.origin}, expected ${expected.origin}`);
  }
  for (const [property, expected] of Object.entries(fixture.expected.properties)) {
    const actual = result.properties.find((candidate) => candidate.property === property);
    if (!actual) {
    failures.push(`${fixture.id}: missing property ${property}`);
      continue;
    }
    if (actual.authored !== expected.authored) failures.push(`${fixture.id}: ${property} authored value was ${actual.authored}, expected ${expected.authored}`);
    const actualTokens = (actual.tokens ?? []).map((token) => token.name);
    if (expected.tokens && JSON.stringify(actualTokens) !== JSON.stringify(expected.tokens)) failures.push(`${fixture.id}: ${property} tokens were ${actualTokens.join(", ")}, expected ${expected.tokens.join(", ")}`);
    if (expected.opacity !== undefined && actual.opacity?.value !== expected.opacity) failures.push(`${fixture.id}: ${property} opacity was ${actual.opacity?.value}, expected ${expected.opacity}`);
    if (expected.opacityToken !== undefined && (actual.opacity?.tokenName ?? null) !== expected.opacityToken) failures.push(`${fixture.id}: ${property} opacity token was ${actual.opacity?.tokenName ?? null}, expected ${expected.opacityToken}`);
    if (expected.computed !== undefined && actual.computed !== expected.computed) failures.push(`${fixture.id}: ${property} computed value was ${actual.computed}, expected ${expected.computed}`);
    if (actual.capability !== expected.capability) failures.push(`${fixture.id}: ${property} capability was ${actual.capability}, expected ${expected.capability}`);
    if (expected.confidence && actual.confidence !== expected.confidence) failures.push(`${fixture.id}: ${property} confidence was ${actual.confidence}, expected ${expected.confidence}`);
    if (expected.structure) {
      if (!actual.structure) {
        failures.push(`${fixture.id}: ${property} was missing structured border values`);
      } else {
        for (const [component, value] of Object.entries(expected.structure)) {
          if (actual.structure[component as "width" | "style" | "color"] !== value) {
            failures.push(`${fixture.id}: ${property} ${component} was ${actual.structure[component as "width" | "style" | "color"]}, expected ${value}`);
          }
        }
      }
    }
  }
  for (const [group, expectedGroup] of Object.entries(fixture.expected.projection?.spacing ?? {})) {
    const actualGroup = result.projection.spacing[group as ProjectionGroup];
    if (!actualGroup) {
      failures.push(`${fixture.id}: missing ${group} inspector projection`);
      continue;
    }
    if (expectedGroup.linked !== undefined && actualGroup.linked !== expectedGroup.linked) {
      failures.push(`${fixture.id}: ${group} linked state was ${actualGroup.linked}, expected ${expectedGroup.linked}`);
    }
    for (const [axis, expectedAxis] of Object.entries(expectedGroup.axes ?? {})) {
      const actualAxis = actualGroup.axes[axis as ProjectionAxis];
      if (!actualAxis) {
        failures.push(`${fixture.id}: missing ${group}-${axis} inspector axis`);
        continue;
      }
      if (actualAxis.state !== expectedAxis.state) {
        failures.push(`${fixture.id}: ${group}-${axis} state was ${actualAxis.state}, expected ${expectedAxis.state}`);
      }
    }
    for (const [side, expectedField] of Object.entries(expectedGroup.fields)) {
      const actualField = actualGroup.fields[side as ProjectionSide];
      if (!actualField) {
        failures.push(`${fixture.id}: missing ${group}-${side} inspector field`);
        continue;
      }
      if (actualField.value !== expectedField.value) failures.push(`${fixture.id}: ${group}-${side} value was ${actualField.value}, expected ${expectedField.value}`);
      if (expectedField.authoredValue !== undefined && actualField.authoredValue !== expectedField.authoredValue) failures.push(`${fixture.id}: ${group}-${side} authored value was ${actualField.authoredValue}, expected ${expectedField.authoredValue}`);
      if (expectedField.tokenName !== undefined && actualField.tokenName !== expectedField.tokenName) failures.push(`${fixture.id}: ${group}-${side} token was ${actualField.tokenName}, expected ${expectedField.tokenName}`);
      if (expectedField.sourceProperty !== undefined && actualField.sourceProperty !== expectedField.sourceProperty) failures.push(`${fixture.id}: ${group}-${side} source property was ${actualField.sourceProperty}, expected ${expectedField.sourceProperty}`);
    }
  }
  if (fixture.expected.preview && !result.preview) failures.push(`${fixture.id}: preview was not run`);
  if (fixture.expected.preview?.computed !== undefined && result.preview?.computedValue !== fixture.expected.preview.computed) failures.push(`${fixture.id}: preview computed value was ${result.preview?.computedValue}, expected ${fixture.expected.preview.computed}`);
  return failures;
}
