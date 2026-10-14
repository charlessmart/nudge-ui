import type {
  BorderStructure,
  ColorOpacity,
  EditCapability,
  OpacityValue,
  TokenReference,
  ValueModifier,
} from "../model/index.ts";
import { splitTopLevelWhitespace, topLevelSlashIndex } from "./cssSyntax.ts";
import { parseBorderComponents, type BorderComponents } from "./borderSemantics.ts";
import { parseFontShorthand } from "./fontSemantics.ts";
import { normalizeOpacityPercent } from "./colorSemantics.ts";
import { classifyEditCapability } from "./propertyPolicy.ts";
import { interpretTokenValue, type TokenInterpretationContext, type TokenValueInterpretation } from "./tokenInterpretation.ts";
import {
  BORDER_RADIUS_CORNERS,
  GAP_AXES,
  SPACING_SIDES,
  expandFourValueShorthand,
  expandTwoValueShorthand,
  logicalPhysicalSides,
  type Directionality,
} from "./boxSemantics.ts";

export type { Directionality } from "./boxSemantics.ts";

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
  propertyOpacity?: OpacityValue;
  color?: TokenValueInterpretation["color"];
  modifiers: ValueModifier[];
  capability: EditCapability;
  structure?: BorderStructure;
  diagnostic?: string;
}

export interface StructuredValuesContext {
  tokenContext: TokenInterpretationContext;
  /** Writing-mode/direction facts for logical→physical mapping; defaults to `ltr`/`horizontal-tb`. */
  directionality?: Directionality;
}

interface PositionValue {
  declaredValue: string;
  resolvedValue: string;
  interpretation: TokenValueInterpretation;
}

function propertyOpacityFor(
  authored: string,
  interpretation: TokenValueInterpretation,
  capability: EditCapability,
): OpacityValue | undefined {
  const value = normalizeOpacityPercent(interpretation.resolvedValue);
  if (value === null) return undefined;
  const token = interpretation.tokenName
    ? interpretation.tokens.find((reference) => reference.name === interpretation.tokenName)
    : undefined;
  return {
    value,
    authoredValue: authored.trim(),
    tokenName: interpretation.tokenName,
    ...(token ? { token } : {}),
    editable: capability !== "raw" && !/\b(?:calc|min|max|clamp|env|anchor-size)\s*\(/i.test(authored),
  };
}

function cycleDiagnostic(cycle: string): string {
  return `custom-property alias cycle includes ${cycle}`;
}

interface FieldProjection {
  property: string;
  declaredValue: string;
  sourceProperty: string;
  interpretation: TokenValueInterpretation;
  capability: EditCapability;
  resolvedValue?: string;
  diagnostic?: string;
  structure?: BorderStructure;
}

function projectField(projection: FieldProjection): StructuredField {
  const { interpretation } = projection;
  return {
    property: projection.property,
    declaredValue: projection.declaredValue,
    sourceProperty: projection.sourceProperty,
    tokenName: interpretation.tokenName,
    resolvedValue: projection.resolvedValue ?? interpretation.resolvedValue,
    tokens: interpretation.tokens,
    opacity: interpretation.opacity,
    ...(projection.property.toLowerCase() === "opacity"
      ? { propertyOpacity: propertyOpacityFor(projection.declaredValue, interpretation, projection.capability) }
      : {}),
    color: interpretation.color,
    modifiers: interpretation.modifiers,
    capability: projection.capability,
    diagnostic: projection.diagnostic
      ?? (interpretation.cycle ? cycleDiagnostic(interpretation.cycle) : undefined),
    structure: projection.structure,
  };
}

function rawField(property: string, authored: string, ctx: StructuredValuesContext): StructuredField {
  const trimmed = authored.trim();
  const interpretation = interpretTokenValue(trimmed, ctx.tokenContext);
  const capability = property.toLowerCase() === "border" ? "raw" : classifyEditCapability(property, authored);
  return projectField({
    property,
    declaredValue: trimmed,
    sourceProperty: property,
    interpretation,
    capability,
    diagnostic: capability === "composite" ? `unsupported composite value for ${property}` : undefined,
  });
}

function unsupportedField(property: string, authored: string, ctx: StructuredValuesContext): StructuredField {
  const field = rawField(property, authored, ctx);
  return {
    ...field,
    capability: "raw",
    diagnostic: field.diagnostic?.startsWith("custom-property alias cycle")
      ? field.diagnostic
      : `unsupported structured value for ${property}`,
  };
}

function fieldFor(property: string, declaredValue: string, sourceProperty: string, ctx: StructuredValuesContext): StructuredField {
  return projectField({
    property,
    declaredValue,
    sourceProperty,
    interpretation: interpretTokenValue(declaredValue, ctx.tokenContext),
    capability: classifyEditCapability(property, declaredValue),
  });
}

/** A multi-length `var()` expands into one position per length, each keeping the token. */
function expandPositionValues(rawValues: string[], ctx: StructuredValuesContext): PositionValue[] {
  return rawValues.flatMap((rawValue) => {
    const res = interpretTokenValue(rawValue, ctx.tokenContext);
    const tokenValues = res.tokenName ? splitTopLevelWhitespace(res.resolvedValue) : [];
    if (res.tokenName && /^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(rawValue) && tokenValues.length > 1) {
      return tokenValues.map((resolvedValue) => ({
        declaredValue: rawValue,
        resolvedValue,
        interpretation: res,
      }));
    }
    return [{ declaredValue: rawValue, resolvedValue: res.resolvedValue, interpretation: res }];
  });
}

function expandLogicalSides(
  sides: readonly string[],
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const rawValues = splitTopLevelWhitespace(authored);
  const positions = expandPositionValues(rawValues, ctx);
  const values = sides.length === 1
    ? positions.length === 1 ? [positions[0]!] : null
    : expandTwoValueShorthand(positions);
  if (!values) return null;
  return sides.map((side, index) => projectPositionField(side, property, values[index]!));
}

function expandBorder(
  lower: string,
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const components: BorderComponents | null = parseBorderComponents(authored.trim(), ctx.tokenContext);
  if (!components) return null;
  // SAFETY: lower is one of the known border structure source properties from the parser typed union.
  const sourceProperty = lower as BorderStructure["sourceProperty"];
  const sidePrefix = sourceProperty === "border" ? "" : `${sourceProperty}-`;
  // Interpret each distinct component once; every projected longhand reuses
  // that component result instead of re-resolving the same token.
  const { widthResult, styleResult, colorResult } = components;
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
    const result = longhand.endsWith("color")
      ? colorResult
      : longhand.endsWith("style") ? styleResult : widthResult;
    return projectField({
      property: longhand,
      declaredValue: authoredValue,
      sourceProperty: property,
      interpretation: result,
      resolvedValue: result.resolvedValue || component,
      capability: "structured",
      structure: scopedStructure,
    });
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
  property: string,
  corners: readonly string[],
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] {
  const rawValues = splitTopLevelWhitespace(authored);
  // Slash-separated radius forms stay conservative: a single raw row.
  if (topLevelSlashIndex(authored) >= 0 || rawValues.length === 0 || rawValues.length > 4) {
    return [unsupportedField(property, authored, ctx)];
  }
  const positions = expandPositionValues(rawValues, ctx);
  const resolvedSlash = positions.some(({ interpretation }) =>
    topLevelSlashIndex(interpretation.resolvedValue) >= 0
    || interpretation.modifiers.some((modifier) =>
      modifier.kind === "fallback" && topLevelSlashIndex(modifier.value) >= 0));
  if (resolvedSlash) return [unsupportedField(property, authored, ctx)];
  const cornerValues = expandFourValueShorthand(positions);
  if (!cornerValues) return [unsupportedField(property, authored, ctx)];
  return corners.map((longhand, index) => projectPositionField(longhand, property, cornerValues[index]!));
}

function projectPositionField(longhand: string, sourceProperty: string, value: PositionValue): StructuredField {
  return projectField({
    property: longhand,
    declaredValue: value.declaredValue,
    sourceProperty,
    interpretation: value.interpretation,
    resolvedValue: value.resolvedValue,
    capability: classifyEditCapability(longhand, value.declaredValue),
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
  return sides.map((longhand, index) => projectPositionField(longhand, property, sideValues[index]!));
}

function expandGap(
  property: string,
  axes: readonly string[],
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] | null {
  const rawValues = splitTopLevelWhitespace(authored);
  const positions = expandPositionValues(rawValues, ctx);
  const axisValues = expandTwoValueShorthand(positions);
  if (!axisValues) return null;
  return axes.map((longhand, index) =>
    projectPositionField(longhand, property, axisValues[index]!));
}

/** Values that cannot be decomposed faithfully collapse to one conservative raw/composite field; families are checked in CSS precedence order. */
export function interpretValue(
  property: string,
  authored: string,
  ctx: StructuredValuesContext,
): StructuredField[] {
  const lower = property.toLowerCase();

  if (lower === "opacity") return [rawField(property, authored, ctx)];

  const logicalSides = logicalPhysicalSides(lower, ctx.directionality);
  if (logicalSides) {
    const fields = expandLogicalSides(logicalSides, property, authored, ctx);
    if (fields) return fields;
    return [unsupportedField(property, authored, ctx)];
  }

  if (lower === "border" || /^border-(?:top|right|bottom|left)$/.test(lower)) {
    const fields = expandBorder(lower, property, authored, ctx);
    if (fields) return fields;
    return [unsupportedField(property, authored, ctx)];
  }

  if (lower === "font") {
    const fields = expandFont(property, authored, ctx);
    if (fields) return fields;
    return [unsupportedField(property, authored, ctx)];
  }

  const corners = BORDER_RADIUS_CORNERS[lower];
  if (corners) return expandCorners(property, corners, authored, ctx);

  const gapAxes = GAP_AXES[lower];
  if (gapAxes) {
    const fields = expandGap(property, gapAxes, authored, ctx);
    if (fields) return fields;
    return [unsupportedField(property, authored, ctx)];
  }

  const sides = SPACING_SIDES[lower];
  if (sides) {
    const fields = expandSides(property, sides, authored, ctx);
    if (fields) return fields;
    return [unsupportedField(property, authored, ctx)];
  }

  return [rawField(property, authored, ctx)];
}

/** @internal Use `interpretValue` in production. */
export const interpretStructuredValue = interpretValue;
