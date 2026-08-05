/**
 * Migration comparison harness (plan slices 3.1–3.6).
 *
 * Runs the "old" and "new" value interpretations against the existing
 * conformance corpus. The "new" side runs the real
 * `@design-tool/css/value-semantics` interpreter for token references,
 * aliases, leaf-token selection, cycles, origins, modifiers, and color/opacity
 * interpretation (plan slice 3.4), the unified property/value policy for
 * capability classification (plan slice 3.3), and the structured-values Module
 * for box, border, border-radius, logical-side, and font decomposition (plan
 * slice 3.5). The integration policies it needs (Tailwind v3 direct
 * attribution, adapter-derived origins, and the `--tw-*` alias policy) come
 * from the resolution integration; writing-mode/direction facts come from the
 * fixture's selected element so logical→physical mapping matches the legacy
 * cascade. This harness is the guardrail that catches behavioral drift against
 * the corpus.
 *
 * The comparison is value-level: it projects every `ResolvedProperty` row the
 * legacy cascade produces onto the same structured outcome the interpretation
 * returns, then diffs field by field. Cascade "exact" confidence upgrades from
 * computed-style validation are intentionally NOT part of the interpretation;
 * both sides derive confidence from token presence via
 * `attributionConfidence`, matching the base rule the current resolver uses.
 */
import type { TokenEntry } from "virtual:design-tokens";
import type { EditCapability, ResolvedProperty, TokenTable } from "@design-tool/css/model";
import type { ValueInterpretation, ValueInterpreter, InterpretationContext } from "@design-tool/css/value-semantics";
import {
  classifyEditCapability,
  interpretStructuredValue,
  interpretTokenValue,
  type Directionality,
  type StructuredField,
} from "@design-tool/css/value-semantics";
import {
  buildTokenTable,
  createTokenInterpretationContext,
} from "../tokens/resolution.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import { runConformanceFixture } from "./fixture.ts";
import type { ConformanceFixture } from "./fixture.ts";

/** A structured outcome that legacy rows and new interpretations both project to. */
export interface ComparedValueOutcome {
  authored: string;
  tokenName: string | null;
  tokens: string[];
  opacity: string | null;
  opacityTokenName: string | null;
  capability: EditCapability;
  modifiers: Array<{ kind: "alpha" | "fallback" | "expression"; value: string }>;
  structure: { width: string; style: string; color: string } | null;
  confidence: "exact" | "probable" | "unknown";
}

const COMPARED_FIELDS = [
  "authored",
  "tokenName",
  "tokens",
  "opacity",
  "opacityTokenName",
  "capability",
  "modifiers",
  "structure",
  "confidence",
] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface ComparisonDiff {
  fixture: string;
  property: string;
  field: string;
  legacy: string;
  interpretation: string;
}

/**
 * Base attribution confidence: a token reference makes a value "probable",
 * a literal value is "unknown". This mirrors the current resolver's base
 * assignment in `rowsFromMatches`. Computed-style "exact" upgrades are a
 * BrowserCssInspection concern and stay out of the value-level comparison.
 */
export function attributionConfidence(tokenName: string | null): "exact" | "probable" | "unknown" {
  return tokenName ? "probable" : "unknown";
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function equal(left: unknown, right: unknown): boolean {
  return formatValue(left) === formatValue(right);
}

const BORDER_SIDE_PROPERTY = /^border-(top|right|bottom|left)$/;

function isBorderShorthandSource(property: string): boolean {
  const p = property.toLowerCase();
  return p === "border" || BORDER_SIDE_PROPERTY.test(p);
}

function isSpacingShorthandSource(property: string): boolean {
  const p = property.toLowerCase();
  return p === "margin" || p === "padding" || p === "inset"
    || /^(?:margin|padding|inset)-(?:inline|block)(?:-(?:start|end))?$/.test(p);
}

/**
 * Properties whose whole authored value is decomposed by the structured-values
 * Module. For these, the row's authored value is the full shorthand (or a
 * projected component) and the Module must run once per source shorthand.
 */
function isStructuredSource(sourceProperty: string): boolean {
  return isBorderShorthandSource(sourceProperty)
    || isSpacingShorthandSource(sourceProperty)
    || sourceProperty.toLowerCase() === "border-radius"
    || sourceProperty.toLowerCase() === "font";
}

function directionalityForElement(el: HTMLElement): Directionality {
  const computed = getElementComputedStyle(el);
  return {
    direction: computed?.direction || el?.dir || "ltr",
    writingMode: computed?.getPropertyValue("writing-mode").trim() || "horizontal-tb",
  };
}

function structuredInterpretation(
  field: StructuredField,
  authored: string,
): ValueInterpretation {
  return {
    authored,
    tokenName: field.tokenName,
    tokens: field.tokens.map((token) => token.name),
    opacity: field.opacity?.value ?? null,
    opacityTokenName: field.opacity?.tokenName ?? null,
    capability: field.capability,
    modifiers: field.modifiers,
    structure: field.structure
      ? { width: field.structure.width, style: field.structure.style, color: field.structure.color }
      : null,
    confidence: attributionConfidence(field.tokenName),
  };
}

/**
 * The "new" interpretation for this slice: token references, aliases,
 * leaf-token selection, cycles, origins, modifiers, and color/opacity
 * interpretation come from the real `@design-tool/css` value-semantics Module;
 * capability comes from the unified property/value policy (slice 3.3); and box,
 * border, radius, and font decomposition comes from the structured-values
 * Module (slice 3.5). The source declaration property comes through
 * `ctx.sourceProperty` so projected shorthand longhands (for example
 * `border-top-width` from `border: 2px solid red`) are distinguished from
 * directly-authored longhands (`border-width: var(--border-size)`), and
 * `ctx.directionality` supplies the writing-mode facts for logical sides.
 *
 * Structured projections are cached per fixture table so the same authored
 * shorthand is interpreted once and every projected row reuses that one
 * interpretation tree.
 */
export function createValueSemanticsInterpreter(): ValueInterpreter {
  const structuredCache = new WeakMap<TokenTable, Map<string, StructuredField[]>>();
  return (property, authored, ctx): ValueInterpretation => {
    const table = ctx.table;
    const localAliases = ctx.localAliases ?? new Map();
    const sourceProperty = ctx.sourceProperty ?? property;
    const tokenContext = createTokenInterpretationContext(table, localAliases);

    if (isStructuredSource(sourceProperty)) {
      const directionality = ctx.directionality;
      const cacheKey = `${sourceProperty}\u0000${authored}\u0000${directionality?.direction ?? ""}\u0000${directionality?.writingMode ?? ""}`;
      let byKey = structuredCache.get(table);
      if (!byKey) {
        byKey = new Map();
        structuredCache.set(table, byKey);
      }
      let fields = byKey.get(cacheKey);
      if (!fields) {
        fields = interpretStructuredValue(sourceProperty, authored, { tokenContext, directionality });
        byKey.set(cacheKey, fields);
      }
      const field = fields.find((candidate) => candidate.property === property);
      if (field) return structuredInterpretation(field, authored);
    }

    const interpretation = interpretTokenValue(authored, tokenContext);
    return {
      authored,
      tokenName: interpretation.tokenName,
      tokens: interpretation.tokens.map((token) => token.name),
      opacity: interpretation.opacity?.value ?? null,
      opacityTokenName: interpretation.opacity?.tokenName ?? null,
      capability: property.toLowerCase() === "border" ? "raw" : classifyEditCapability(property, authored),
      modifiers: interpretation.modifiers,
      structure: null,
      confidence: attributionConfidence(interpretation.tokenName),
    };
  };
}

function projectLegacyRow(row: ResolvedProperty): ComparedValueOutcome {
  return {
    authored: row.authored ?? row.declaredValue ?? "",
    tokenName: row.tokenName,
    tokens: (row.tokens ?? []).map((token) => token.name),
    opacity: row.opacity?.value ?? null,
    opacityTokenName: row.opacity?.tokenName ?? null,
    capability: row.capability ?? "raw",
    modifiers: (row.modifiers ?? []).map((modifier) => ({ kind: modifier.kind, value: modifier.value })),
    structure: row.structure
      ? { width: row.structure.width, style: row.structure.style, color: row.structure.color }
      : null,
    confidence: attributionConfidence(row.tokenName),
  };
}

function tableForFixture(fixture: ConformanceFixture) {
  return buildTokenTable(
    fixture.catalog.map((definition): TokenEntry => ({
      name: definition.name,
      cssName: definition.cssName,
      value: definition.declarations[0]?.value ?? "",
      source: definition.declarations[0]?.source ?? "",
      adapter: definition.adapter,
      origin: definition.origin,
      editable: definition.editable,
    })),
  );
}

/**
 * Runs one conformance fixture through the legacy inspection path and the
 * given new interpretation, comparing every produced property row. Returns a
 * list of field-level diffs (empty when both interpretations agree).
 */
export function compareFixtureInterpretation(
  fixture: ConformanceFixture,
  interpreter: ValueInterpreter,
  doc: Document = document,
): ComparisonDiff[] {
  const result = runConformanceFixture(fixture, doc);
  try {
    const directionality = directionalityForElement(result.selected);
    const ctx: InterpretationContext = { table: tableForFixture(fixture), localAliases: new Map(), directionality };
    const diffs: ComparisonDiff[] = [];
    for (const row of result.properties) {
      const authored = row.authored ?? row.declaredValue ?? "";
      const sourceProperty = row.sourceProperty;
      const rowContext: InterpretationContext = sourceProperty && sourceProperty !== row.property
        ? { ...ctx, sourceProperty }
        : ctx;
      let interpretation: ValueInterpretation;
      try {
        interpretation = interpreter(row.property, authored, rowContext);
      } catch (error) {
        diffs.push({
          fixture: fixture.id,
          property: row.property,
          field: "interpretation",
          legacy: "",
          interpretation: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const legacy = projectLegacyRow(row);
      for (const field of COMPARED_FIELDS) {
        if (!equal(legacy[field], interpretation[field])) {
          diffs.push({
            fixture: fixture.id,
            property: row.property,
            field,
            legacy: formatValue(legacy[field]),
            interpretation: formatValue(interpretation[field]),
          });
        }
      }
    }
    return diffs;
  } finally {
    result.cleanup();
  }
}

/**
 * Runs every fixture in the given corpus through the comparison harness and
 * returns the combined diff list. Convenience for the corpus-wide guardrail.
 */
export function compareCorpusInterpretation(
  corpus: readonly ConformanceFixture[],
  interpreter: ValueInterpreter,
  doc: Document = document,
): ComparisonDiff[] {
  return corpus.flatMap((fixture) => compareFixtureInterpretation(fixture, interpreter, doc));
}
