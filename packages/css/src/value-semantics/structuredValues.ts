/**
 * Structured and box value interpretation (plan slice 3.5).
 *
 * One browser-safe Module turns an authored CSSOM value for a box/border/
 * radius/font property into a structured projection tree: the physical sides,
 * border longhands, radius corners, or font longhands it expands to, each with
 * source-property provenance and its own token interpretation.
 *
 * One interpretation tree: each distinct authored component is token-interpreted
 * once and every projected field that carries that component reuses the same
 * interpretation (tokenName, tokens, opacity, modifiers, cycle). A border color
 * token, a multi-value spacing token, or a radius token is therefore resolved
 * once per declaration, not once per projected longhand.
 *
 * Conservative fallbacks: ambiguous borders, slash-separated radius forms,
 * complex fonts, and everything outside the supported families stay a single
 * raw/composite row with the resolution's existing capability classification.
 *
 * Browser-safe contract: this module imports only the shared model and the
 * other value-semantics Modules. Directionality is an explicit input fact; it
 * never walks the DOM or CSSOM.
 */
import type {
  BorderStructure,
  ColorOpacity,
  EditCapability,
  TokenReference,
  ValueModifier,
} from "../model/index.ts";
import { splitTopLevelWhitespace, topLevelSlashIndex } from "./cssSyntax.ts";
import { parseBorderComponents, type BorderComponents } from "./borderSemantics.ts";
import { parseFontShorthand } from "./fontSemantics.ts";
import { classifyEditCapability } from "./propertyPolicy.ts";
import { interpretTokenValue, type TokenInterpretationContext, type TokenValueInterpretation } from "./tokenInterpretation.ts";
import {
  BORDER_RADIUS_CORNERS,
  SPACING_SIDES,
  expandFourValueShorthand,
  expandTwoValueShorthand,
  logicalPhysicalSides,
  type Directionality,
} from "./boxSemantics.ts";

export type { Directionality } from "./boxSemantics.ts";

/** One projected longhand row from the structured interpretation. */
export interface StructuredField {
  property: string;
  /** The authored value projected to this field (per-side/corner/longhand). */
  declaredValue: string;
  /** The shorthand the field came from (e.g. `"border"`, `"padding-inline"`). */
  sourceProperty: string;
  tokenName: string | null;
  resolvedValue: string;
  tokens: TokenReference[];
  opacity?: ColorOpacity;
  color?: TokenValueInterpretation["color"];
  modifiers: ValueModifier[];
  capability: EditCapability;
  structure?: BorderStructure;
  diagnostic?: string;
}

/** Explicit, DOM-free facts the structured interpretation needs. */
export interface StructuredValuesContext {
  /** Token table plus the integration's token-interpretation policies. */
  tokenContext: TokenInterpretationContext;
  /**
   * Writing-mode/direction facts for logical→physical mapping. Absent →
   * `ltr` / `horizontal-tb`.
   */
  directionality?: Directionality;
}

interface PositionValue {
  declaredValue: string;
  tokenName: string | null;
  resolvedValue: string;
  interpretation: TokenValueInterpretation;
}

function cycleDiagnostic(cycle: string): string {
  return `custom-property alias cycle includes ${cycle}`;
}

function rawField(property: string, authored: string, ctx: StructuredValuesContext): StructuredField {
  const trimmed = authored.trim();
  const resolved = interpretTokenValue(trimmed, ctx.tokenContext);
  return {
    property,
    declaredValue: trimmed,
    sourceProperty: property,
    tokenName: resolved.tokenName,
    resolvedValue: resolved.resolvedValue,
    tokens: resolved.tokens,
    opacity: resolved.opacity,
    color: resolved.color,
    modifiers: resolved.modifiers,
    capability: property.toLowerCase() === "border" ? "raw" : classifyEditCapability(property, authored),
    diagnostic: resolved.cycle ? cycleDiagnostic(resolved.cycle) : undefined,
  };
}

function fieldFor(property: string, declaredValue: string, sourceProperty: string, ctx: StructuredValuesContext): StructuredField {
  const resolved = interpretTokenValue(declaredValue, ctx.tokenContext);
  return {
    property,
    declaredValue,
    sourceProperty,
    tokenName: resolved.tokenName,
    resolvedValue: resolved.resolvedValue,
    tokens: resolved.tokens,
    opacity: resolved.opacity,
    color: resolved.color,
    modifiers: resolved.modifiers,
    capability: classifyEditCapability(property, declaredValue),
    diagnostic: resolved.cycle ? cycleDiagnostic(resolved.cycle) : undefined,
  };
}

/**
 * Expands authored raw values into per-position entries, deriving each
 * component's token interpretation once. A bare `var()` whose resolved value
 * is multiple lengths expands into multiple positions, preserving the token
 * on every one.
 */
function expandPositionValues(rawValues: string[], ctx: StructuredValuesContext): PositionValue[] {
  return rawValues.flatMap((rawValue) => {
    const res = interpretTokenValue(rawValue, ctx.tokenContext);
    const tokenValues = res.tokenName ? splitTopLevelWhitespace(res.resolvedValue) : [];
    if (res.tokenName && /^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(rawValue) && tokenValues.length > 1) {
      return tokenValues.map((resolvedValue) => ({
        declaredValue: rawValue,
        tokenName: res.tokenName,
        resolvedValue,
        interpretation: res,
      }));
    }
    return [{ declaredValue: rawValue, tokenName: res.tokenName, resolvedValue: res.resolvedValue, interpretation: res }];
  });
}

function expandLogicalSides(
  lower: string,
  sides: readonly string[],
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const rawValues = splitTopLevelWhitespace(authored);
  const values = sides.length === 1
    ? rawValues.length === 1 ? [rawValues[0]!] : null
    : expandTwoValueShorthand(rawValues);
  if (!values) return null;
  return sides.map((side, index) => fieldFor(side, values[index]!, property, ctx));
}

function expandBorder(
  lower: string,
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const components: BorderComponents | null = parseBorderComponents(authored.trim(), ctx.tokenContext.table);
  if (!components) return null;
  const sourceProperty = lower as BorderStructure["sourceProperty"];
  const sidePrefix = sourceProperty === "border" ? "" : `${sourceProperty}-`;
  // One interpretation of the color component feeds every projected color
  // longhand and the structure's colorTokenName (one interpretation tree).
  const colorResult = interpretTokenValue(components.color, ctx.tokenContext);
  const scopedStructure: BorderStructure = {
    kind: "border",
    sourceProperty,
    width: components.width,
    style: components.style,
    color: components.color,
    colorTokenName: colorResult.tokenName,
  };
  const authoredValue = authored.trim();
  const entries: ReadonlyArray<readonly [string, string]> = sidePrefix
    ? [[`${sidePrefix}width`, components.width], [`${sidePrefix}style`, components.style], [`${sidePrefix}color`, components.color]]
    : [
      ["border-width", components.width], ["border-style", components.style], ["border-color", components.color],
      ["border-top-width", components.width], ["border-right-width", components.width], ["border-bottom-width", components.width], ["border-left-width", components.width],
      ["border-top-style", components.style], ["border-right-style", components.style], ["border-bottom-style", components.style], ["border-left-style", components.style],
      ["border-top-color", components.color], ["border-right-color", components.color], ["border-bottom-color", components.color], ["border-left-color", components.color],
    ];
  return entries.map(([longhand, component]) => {
    const isColor = longhand.endsWith("color");
    return {
      property: longhand,
      declaredValue: authoredValue,
      sourceProperty: property,
      tokenName: isColor ? colorResult.tokenName : null,
      resolvedValue: isColor ? colorResult.resolvedValue : component,
      tokens: isColor ? colorResult.tokens : [],
      opacity: isColor ? colorResult.opacity : undefined,
      color: isColor ? colorResult.color : undefined,
      modifiers: isColor ? colorResult.modifiers : [],
      capability: "structured" as const,
      diagnostic: colorResult.cycle ? cycleDiagnostic(colorResult.cycle) : undefined,
      structure: scopedStructure,
    };
  });
}

function expandFont(
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const parts = parseFontShorthand(authored);
  if (!parts) return null;
  return Object.entries(parts).map(([longhand, declaredValue]) => fieldFor(longhand, declaredValue, property, ctx));
}

function expandCorners(
  lower: string,
  property: string,
  corners: readonly string[],
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] {
  const rawValues = splitTopLevelWhitespace(authored);
  // Slash-separated radius forms stay conservative: a single raw row.
  if (topLevelSlashIndex(authored) >= 0 || rawValues.length === 0 || rawValues.length > 4) {
    return [rawField(property, authored, ctx)];
  }
  const cornerValues = expandFourValueShorthand(expandPositionValues(rawValues, ctx));
  if (!cornerValues) return [rawField(property, authored, ctx)];
  return corners.map((longhand, index) => {
    const value = cornerValues[index]!;
    return {
      property: longhand,
      declaredValue: value.declaredValue,
      sourceProperty: property,
      tokenName: value.tokenName,
      resolvedValue: value.resolvedValue,
      tokens: value.interpretation.tokens,
      opacity: value.interpretation.opacity,
      color: value.interpretation.color,
      modifiers: value.interpretation.modifiers,
      capability: classifyEditCapability(longhand, value.declaredValue),
      diagnostic: value.interpretation.cycle ? cycleDiagnostic(value.interpretation.cycle) : undefined,
    };
  });
}

function expandSides(
  property: string,
  sides: readonly string[],
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const rawValues = splitTopLevelWhitespace(authored);
  if (rawValues.length === 0 || rawValues.length > 4) return null;
  const sideValues = expandFourValueShorthand(expandPositionValues(rawValues, ctx));
  if (!sideValues) return null;
  return sides.map((longhand, index) => {
    const value = sideValues[index]!;
    return {
      property: longhand,
      declaredValue: value.declaredValue,
      sourceProperty: property,
      tokenName: value.tokenName,
      resolvedValue: value.resolvedValue,
      tokens: value.interpretation.tokens,
      opacity: value.interpretation.opacity,
      color: value.interpretation.color,
      modifiers: value.interpretation.modifiers,
      capability: classifyEditCapability(longhand, value.declaredValue),
      diagnostic: value.interpretation.cycle ? cycleDiagnostic(value.interpretation.cycle) : undefined,
    };
  });
}

/**
 * Interprets one authored value for a property into a structured projection
 * tree. Returns the projected fields, or a single conservative raw/composite
 * field when the value cannot be decomposed faithfully. The declared order of
 * the families mirrors the legacy resolver: logical sides, border, font,
 * border-radius corners, physical spacing, then the raw fallback.
 */
export function interpretStructuredValue(
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] {
  const lower = property.toLowerCase();

  const logicalSides = logicalPhysicalSides(lower, ctx.directionality);
  if (logicalSides) {
    const fields = expandLogicalSides(lower, logicalSides, property, authored, ctx);
    if (fields) return fields;
  }

  if (lower === "border" || /^border-(?:top|right|bottom|left)$/.test(lower)) {
    const fields = expandBorder(lower, property, authored, ctx);
    if (fields) return fields;
  }

  if (lower === "font") {
    const fields = expandFont(property, authored, ctx);
    if (fields) return fields;
  }

  const corners = BORDER_RADIUS_CORNERS[lower];
  if (corners) return expandCorners(lower, property, corners, authored, ctx);

  const sides = SPACING_SIDES[lower];
  if (sides) {
    const fields = expandSides(property, sides, authored, ctx);
    if (fields) return fields;
  }

  return [rawField(property, authored, ctx)];
}
