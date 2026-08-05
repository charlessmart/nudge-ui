/**
 * Migration comparison harness (plan slices 3.1–3.6).
 *
 * Runs the "old" and "new" value interpretations against the existing
 * conformance corpus. The "new" side runs the real
 * `@design-tool/css/value-semantics` token interpreter for token references,
 * aliases, leaf-token selection, cycles, origins, and modifiers, and the
 * unified property/value policy for capability classification (plan slice
 * 3.3). The integration policies it needs (Tailwind v3 direct attribution,
 * the color/opacity resolver, adapter-derived origins, and the `--tw-*` alias
 * policy) come from the resolution integration. Color/opacity and structured
 * values still come from the legacy path and migrate in slices 3.4–3.5. This
 * harness is the guardrail that catches behavioral drift against the corpus.
 *
 * The comparison is value-level: it projects every `ResolvedProperty` row the
 * legacy cascade produces onto the same structured outcome the interpretation
 * returns, then diffs field by field. Cascade "exact" confidence upgrades from
 * computed-style validation are intentionally NOT part of the interpretation;
 * both sides derive confidence from token presence via
 * `attributionConfidence`, matching the base rule the current resolver uses.
 */
import type { TokenEntry } from "virtual:design-tokens";
import type { EditCapability, ResolvedProperty } from "@design-tool/css/model";
import type { ValueInterpretation, ValueInterpreter, InterpretationContext } from "@design-tool/css/value-semantics";
import { classifyEditCapability, interpretTokenValue } from "@design-tool/css/value-semantics";
import {
  buildTokenTable,
  createTokenInterpretationContext,
  parseBorderShorthand,
} from "../tokens/resolution.ts";
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

/**
 * The "new" interpretation for this slice: token references, aliases,
 * leaf-token selection, cycles, origins, and modifiers come from the real
 * `@design-tool/css` value-semantics Module; color/opacity resolution,
 * capability, and border structure still come from the legacy integration
 * helpers (slices 3.3–3.5 migrate those). The source declaration property
 * comes through `ctx.sourceProperty` so projected shorthand longhands (for
 * example `border-top-width` from `border: 2px solid red`) are distinguished
 * from directly-authored longhands (`border-width: var(--border-size)`).
 */
export function createValueSemanticsInterpreter(): ValueInterpreter {
  return (property, authored, ctx): ValueInterpretation => {
    const table = ctx.table;
    const localAliases = ctx.localAliases ?? new Map();
    const sourceProperty = ctx.sourceProperty ?? property;
    const propertyLower = property.toLowerCase();

    if (isBorderShorthandSource(sourceProperty)) {
      const structure = parseBorderShorthand(authored, table);
      if (structure) {
        const isColorRow = propertyLower.endsWith("color");
        const colorResult = isColorRow
          ? interpretTokenValue(structure.color, createTokenInterpretationContext(table, localAliases))
          : null;
        return {
          authored,
          tokenName: colorResult?.tokenName ?? null,
          tokens: colorResult?.tokens.map((token) => token.name) ?? [],
          opacity: colorResult?.opacity?.value ?? null,
          opacityTokenName: colorResult?.opacity?.tokenName ?? null,
          capability: "structured",
          modifiers: colorResult?.modifiers ?? [],
          structure: { width: structure.width, style: structure.style, color: structure.color },
          confidence: attributionConfidence(colorResult?.tokenName ?? null),
        };
      }
    }

    const interpretation = interpretTokenValue(authored, createTokenInterpretationContext(table, localAliases));
    return {
      authored,
      tokenName: interpretation.tokenName,
      tokens: interpretation.tokens.map((token) => token.name),
      opacity: interpretation.opacity?.value ?? null,
      opacityTokenName: interpretation.opacity?.tokenName ?? null,
      capability: propertyLower === "border" ? "raw" : classifyEditCapability(property, authored),
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
    const ctx: InterpretationContext = { table: tableForFixture(fixture), localAliases: new Map() };
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
