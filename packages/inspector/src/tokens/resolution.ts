import type { TokenEntry } from "virtual:design-tokens";
import { tokenCatalog, tokens } from "virtual:design-tokens";
import { INTERACTION_STATES } from "../styleState.ts";
import type { InteractionState } from "../styleState.ts";

export interface ResolvedProperty {
  property: string;
  tokenName: string | null;
  declaredValue: string;
  resolvedValue: string;
  /** Product-contract aliases. `declaredValue`/`resolvedValue` remain for UI compatibility. */
  authored?: string;
  sourceProperty?: string;
  computed?: string;
  tokens?: TokenReference[];
  modifiers?: ValueModifier[];
  capability?: EditCapability;
  resolvedTokenValue?: string;
  diagnostic?: string;
  structure?: BorderStructure;
  confidence: "exact" | "probable" | "unknown";
  evidence: AttributionEvidence;
}

export type TokenOrigin = "project" | "framework" | "generated" | "runtime";
export type EditCapability = "atomic" | "color" | "box-sides" | "structured" | "composite" | "raw";
export interface TokenReference { name: string; origin: TokenOrigin }
export interface ValueModifier { kind: "alpha" | "fallback" | "expression"; value: string }
export interface BorderStructure {
  kind: "border";
  sourceProperty: "border" | "border-top" | "border-right" | "border-bottom" | "border-left";
  width: string;
  style: string;
  color: string;
  colorTokenName: string | null;
}

export interface AttributionEvidence {
  selector?: string;
  sourceOrder?: number;
  specificity?: number;
  important?: boolean;
  layer?: string;
  inheritedFrom?: string;
  inaccessibleStylesheet?: boolean;
  reason: string;
}

export interface TokenTable {
  [varName: string]: TokenEntry;
}

interface StyleDeclaration {
  property: string;
  value: string;
  important?: boolean;
}

export interface MatchedRule {
  selectorText: string;
  declarations: StyleDeclaration[];
  specificity: number;
  sourceOrder?: number;
  layer?: string;
  active?: boolean;
}

const MAX_PROPERTIES = 100;
const VAR_REF = /var\(\s*(--[\w-]+)/g;
const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();
const SPACING_SIDES: Record<string, readonly string[]> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};

export function buildTokenTable(entries: TokenEntry[]): TokenTable {
  const table: TokenTable = {};
  for (const entry of entries) {
    table[entry.name] = entry;
    if (entry.cssName) table[entry.cssName] = entry;
  }
  return table;
}

function tokenVariableName(entry: TokenEntry): string {
  return entry.cssName ?? entry.name;
}

function tokenOrigin(entry: TokenEntry | undefined): TokenOrigin {
  if (!entry) return "runtime";
  if (entry.origin) return entry.origin;
  if (entry.adapter === "tailwind-v3" || entry.adapter === "tailwind-v4") return "framework";
  if (entry.adapter === "vanilla-extract") return "project";
  return "project";
}

function extractVarCalls(value: string): Array<{ name: string; fallback?: string }> {
  const calls: Array<{ name: string; fallback?: string }> = [];
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf("var(", i);
    if (start < 0) break;
    let depth = 1;
    let j = start + 4;
    let comma = -1;
    while (j < value.length && depth > 0) {
      const char = value[j];
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === "," && depth === 1 && comma < 0) comma = j;
      j++;
    }
    const body = value.slice(start + 4, Math.max(start + 4, j - 1)).trim();
    const name = (body.slice(0, comma < 0 ? body.length : comma - start - 4).trim().match(/^--[\w-]+/) ?? [])[0];
    if (name) {
      const fallback = comma >= 0 ? value.slice(comma + 1, Math.max(comma + 1, j - 1)).trim() : undefined;
      calls.push({ name, fallback });
    }
    i = Math.max(j, start + 4);
  }
  return calls;
}

function capabilityFor(property: string, value: string): EditCapability {
  const p = property.toLowerCase();
  const v = value.trim().toLowerCase();
  // Functions whose authored expression cannot be represented faithfully by
  // a numeric side control remain raw even when the property itself is a
  // spacing property. The computed value is still available as a preview.
  if (/\b(?:calc|min|max|clamp|env|anchor-size)\s*\(/.test(v)) return "raw";
  if (["margin", "padding", "inset", "inset-block", "inset-inline"].includes(p)
    || p.startsWith("margin-") || p.startsWith("padding-") || p.startsWith("inset-")) return "box-sides";
  if (p === "border" || p.endsWith("-border") || p === "border-color" || p.endsWith("-border-color")) return "structured";
  if (p === "color" || /(^|-)color$/.test(p) || p === "background-color" || p === "fill" || p === "stroke") return "color";
  if (/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(v)) return "atomic";
  if (p === "font" || /(gradient|shadow|transform|transition|animation|grid|background)/.test(p)
    || (v.includes(",") && !/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(v))) return "composite";
  if (/\b(calc|min|max|clamp|color-mix)\s*\(/.test(v)) return "raw";
  if (/^[+-]?(?:\d*\.)?\d+(?:[a-z%]+)?$/i.test(v)
    || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|transparent|currentcolor)/.test(v)) return "atomic";
  return "raw";
}

function colorTuple(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\s*\/\s*var\([^)]*\)/, "");
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const expanded = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
    return [expanded.slice(0, 2), expanded.slice(2, 4), expanded.slice(4, 6)].map((part) => Number.parseInt(part, 16)).join(",");
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(trimmed);
  return rgb ? [rgb[1], rgb[2], rgb[3]].map((part) => String(Math.round(Number(part)))).join(",") : null;
}

function directFrameworkColor(value: string, tokenTable: TokenTable): TokenEntry | null {
  const tuple = colorTuple(value);
  if (!tuple) return null;
  return Object.values(tokenTable).find((entry) => entry.adapter === "tailwind-v3" && colorTuple(entry.value) === tuple) ?? null;
}

export function classifyValue(property: string, authored: string): EditCapability {
  return capabilityFor(property, authored);
}

let tableCache: TokenTable | null = null;
let tableSource: TokenEntry[] | null = null;

export function getTokenTable(): TokenTable {
  if (tableCache !== null && tableSource === tokens) return tableCache;
  tableCache = buildTokenTable(tokens);
  tableSource = tokens;
  return tableCache;
}

export function getTokenEntriesForElement(el: HTMLElement): TokenEntry[] {
  const computed = getComputedStyle(el);
  return tokenCatalog.map((definition) => ({
    name: definition.name,
    cssName: definition.cssName,
    value: computed.getPropertyValue(definition.cssName).trim()
      || definition.declarations[0]?.value
      || "",
    source: definition.declarations[0]?.source ?? "",
    adapter: definition.adapter,
    origin: definition.origin,
    editable: definition.editable,
  }));
}

function normalizeInElementContext(el: HTMLElement, property: string, value: string): string {
  const probe = document.createElement(el.tagName.toLowerCase());
  probe.setAttribute("data-design-tool", "attribution-probe");
  probe.style.setProperty(property, value, "important");
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) document.body.appendChild(probe);
  const normalized = getComputedStyle(probe).getPropertyValue(property).trim();
  probe.remove();
  return normalized;
}

function candidateMatchesPainted(el: HTMLElement, row: ResolvedProperty, painted: string): boolean {
  if (!row.tokenName || !/^var\(\s*--[\w-]+\s*\)$/.test(row.declaredValue)) return false;
  return normalizeInElementContext(el, row.property, row.declaredValue) === painted.trim();
}

function resolveRef(
  ref: string,
  tokenTable: TokenTable,
  visited: Set<string>,
  localAliases: ReadonlyMap<string, string>,
): { known: boolean; tokenName: string | null; resolvedValue: string; leafTokenName: string | null; cycle?: string } {
  if (visited.has(ref)) {
    const entry = tokenTable[ref];
    return {
      known: entry !== undefined,
      tokenName: entry ? entry.name : null,
      resolvedValue: entry ? entry.value : `var(${ref})`,
      leafTokenName: entry ? entry.name : null,
      cycle: ref,
    };
  }
  const entry = tokenTable[ref];
  if (entry) {
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    const inner = resolveTokenValueInner(entry.value, tokenTable, nextVisited, localAliases);
    return { known: true, tokenName: entry.name, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? entry.name, cycle: inner.cycle };
  }

  const localValue = localAliases.get(ref);
  if (localValue === undefined) {
    return { known: false, tokenName: null, resolvedValue: `var(${ref})`, leafTokenName: null };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(ref);
  const inner = resolveTokenValueInner(localValue, tokenTable, nextVisited, localAliases);
  return inner.tokenName
    ? { known: true, tokenName: inner.tokenName, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? null, cycle: inner.cycle }
    : { known: false, tokenName: null, resolvedValue: `var(${ref})`, leafTokenName: null, cycle: inner.cycle };
}

function resolveTokenValueInner(
  value: string,
  tokenTable: TokenTable,
  visited: Set<string>,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
): { tokenName: string | null; resolvedValue: string; leafTokenName?: string | null; cycle?: string } {
  const trimmed = value.trim();
  const refs = extractVarCalls(trimmed).map((call) => call.name);
  if (refs.length === 0) return { tokenName: null, resolvedValue: trimmed, leafTokenName: null };
  for (const ref of refs) {
    const res = resolveRef(ref, tokenTable, visited, localAliases);
    if (res.known) return { tokenName: res.tokenName, resolvedValue: res.resolvedValue, leafTokenName: res.leafTokenName, cycle: res.cycle };
  }
  return { tokenName: null, resolvedValue: trimmed, leafTokenName: null };
}

export function resolveTokenValue(
  value: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
): { tokenName: string | null; resolvedValue: string; tokens: TokenReference[]; modifiers: ValueModifier[]; leafTokenName: string | null; cycle?: string } {
  const authored = value.trim();
  const calls = extractVarCalls(authored);
  const references: TokenReference[] = [];
  let firstKnown: { tokenName: string; leafTokenName: string | null; resolvedValue: string; cycle?: string } | null = null;
  const directToken = calls.length === 0 ? directFrameworkColor(authored, tokenTable) : directFrameworkColor(authored, tokenTable);
  if (directToken) {
    firstKnown = { tokenName: directToken.name, leafTokenName: directToken.name, resolvedValue: directToken.value };
    references.push({ name: directToken.name, origin: tokenOrigin(directToken) });
  }
  for (const call of calls) {
    const result = resolveRef(call.name, tokenTable, new Set(), localAliases);
    if (result.known) {
      if (!references.some((token) => token.name === result.tokenName)) {
        references.push({ name: result.tokenName ?? call.name, origin: tokenOrigin(tokenTable[call.name] ?? tokenTable[result.tokenName ?? ""]!) });
      }
      if (!firstKnown) firstKnown = { tokenName: result.tokenName ?? call.name, leafTokenName: result.leafTokenName, resolvedValue: result.resolvedValue, cycle: result.cycle };
    }
    if (call.fallback) {
      const fallback = call.fallback.trim();
      if (fallback) {
        const fallbackResult = resolveTokenValue(fallback, tokenTable, localAliases);
        references.push(...fallbackResult.tokens.filter((token) => !references.some((seen) => seen.name === token.name)));
        if (!firstKnown && fallbackResult.tokenName) {
          firstKnown = {
            tokenName: fallbackResult.tokenName,
            leafTokenName: fallbackResult.leafTokenName,
            resolvedValue: fallbackResult.resolvedValue,
            cycle: fallbackResult.cycle,
          };
        }
      }
    }
  }
  const modifiers: ValueModifier[] = calls.flatMap((call) => call.fallback ? [{ kind: "fallback" as const, value: call.fallback }] : []);
  const alpha = authored.match(/(?:color-mix\([^,]+,\s*var\([^)]*\)\s+)(\d+(?:\.\d+)?%)/i)?.[1]
    ?? authored.match(/\/\s*(\d+(?:\.\d+)?%?)(?:\s*\)|\s*$)/)?.[1];
  if (alpha) modifiers.push({ kind: "alpha", value: alpha.includes("%") ? alpha : `${alpha}%` });
  for (const call of calls) {
    const localAlpha = localAliases.get(call.name);
    if (localAlpha && /^--tw-(?:bg|text|border)-opacity$/.test(call.name)) {
      const numeric = Number(localAlpha);
      if (Number.isFinite(numeric)) modifiers.push({ kind: "alpha", value: `${numeric <= 1 ? numeric * 100 : numeric}%` });
    }
  }
  const inner = resolveTokenValueInner(authored, tokenTable, new Set(), localAliases);
  return {
    tokenName: firstKnown?.tokenName ?? inner.tokenName,
    resolvedValue: firstKnown?.resolvedValue ?? inner.resolvedValue,
    tokens: references,
    modifiers,
    leafTokenName: firstKnown?.leafTokenName ?? firstKnown?.tokenName ?? null,
    cycle: firstKnown?.cycle,
  };
}

function splitTopLevelWhitespace(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && /\s/.test(char ?? "")) {
      if (i > start) parts.push(value.slice(start, i));
      start = i + 1;
    }
  }

  if (start < value.length) parts.push(value.slice(start));
  return parts;
}

const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
const BORDER_WIDTHS = new Set(["thin", "medium", "thick"]);
const COLOR_KEYWORDS = new Set(["transparent", "currentcolor", "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "orange"]);

export function parseBorderShorthand(value: string, tokenTable: TokenTable): BorderStructure | null {
  const parts = splitTopLevelWhitespace(value.trim());
  if (parts.length !== 3) return null;
  let width = "";
  let style = "";
  let color = "";
  for (const part of parts) {
    const lower = part.toLowerCase();
    const varName = /^var\(\s*(--[\w-]+)/i.exec(part)?.[1];
    const varValue = varName ? tokenTable[varName]?.value ?? "" : "";
    if (!width && (BORDER_WIDTHS.has(lower) || /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(part) || (varName !== undefined && /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(varValue.trim())))) width = part;
    else if (!style && BORDER_STYLES.has(lower)) style = part;
    else if (!color && (COLOR_KEYWORDS.has(lower) || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|var\(\s*--)/i.test(part))) color = part;
    else return null;
  }
  if (!width || !style || !color) return null;
  const colorResult = resolveTokenValue(color, tokenTable);
  if (color.startsWith("var(") && !colorResult.tokenName) return null;
  return { kind: "border", sourceProperty: "border", width, style, color, colorTokenName: colorResult.tokenName };
}

function expandFourValueShorthand<T>(values: readonly T[]): [T, T, T, T] | null {
  if (values.length === 0 || values.length > 4) return null;
  const top = values[0]!;
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  if (values.length === 3) return [top, right, bottom, right];
  if (values.length === 2) return [top, right, top, right];
  return [top, right, bottom, left];
}

function expandTwoValueShorthand<T>(values: readonly T[]): [T, T] | null {
  if (values.length === 0 || values.length > 2) return null;
  return values.length === 1 ? [values[0]!, values[0]!] : [values[0]!, values[1]!];
}

const FONT_SYSTEM_KEYWORDS = new Set([
  "caption", "icon", "menu", "message-box", "small-caption", "status-bar",
]);
const FONT_SIZE_KEYWORDS = new Set([
  "xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large",
  "larger", "smaller",
]);
const FONT_WEIGHT_KEYWORDS = new Set(["normal", "bold", "bolder", "lighter"]);

interface FontShorthandParts {
  "font-family": string;
  "font-size": string;
  "font-weight"?: string;
  "line-height"?: string;
}

/**
 * Splits a font shorthand without losing quoted family names or functions.
 * The slash is a token only at top level, which lets us distinguish the
 * optional `font-size / line-height` portion from a slash in a URL/function.
 */
function splitFontShorthand(value: string): string[] {
  const parts: string[] = [];
  let start = -1;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      if (start < 0) start = index;
      continue;
    }
    if (char === "(") {
      depth++;
      if (start < 0) start = index;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && (char === "/" || /\s/.test(char))) {
      if (start >= 0) {
        parts.push(value.slice(start, index));
        start = -1;
      }
      if (char === "/") parts.push(char);
      continue;
    }
    if (start < 0) start = index;
  }
  if (start >= 0) parts.push(value.slice(start));
  return parts;
}

function isFontSize(value: string): boolean {
  const lower = value.toLowerCase();
  return FONT_SIZE_KEYWORDS.has(lower)
    || /^(?:[+-]?(?:\d*\.)?\d+(?:[a-z]+|%)|(?:var|calc|min|max|clamp|env)\()/i.test(value);
}

/**
 * Returns only the typography longhands that are explicitly present in an
 * unambiguous `font` shorthand. System-font shorthands and percentage-sized
 * variants are deliberately left raw: their individual intent cannot be
 * recovered without changing the author's meaning.
 */
function parseFontShorthand(value: string): FontShorthandParts | null {
  const source = value.trim();
  if (!source || FONT_SYSTEM_KEYWORDS.has(source.toLowerCase())) return null;
  const parts = splitFontShorthand(source);
  const sizeIndex = parts.findIndex(isFontSize);
  if (sizeIndex < 0) return null;
  const fontSize = parts[sizeIndex]!;
  // Percentages may be a preceding font-stretch component or the required
  // size. Keep this uncommon form raw rather than choose arbitrarily.
  if (/^[+-]?(?:\d*\.)?\d+%$/.test(fontSize) && sizeIndex > 0) return null;

  let cursor = sizeIndex + 1;
  let lineHeight: string | undefined;
  if (parts[cursor] === "/") {
    lineHeight = parts[cursor + 1];
    if (!lineHeight) return null;
    cursor += 2;
  }
  const family = parts.slice(cursor).join(" ").trim();
  if (!family) return null;

  const weight = parts.slice(0, sizeIndex).find((part) => (
    FONT_WEIGHT_KEYWORDS.has(part.toLowerCase()) || /^(?:[1-9]\d{0,2}|1000)$/.test(part)
  ));
  return {
    "font-family": family,
    "font-size": fontSize,
    ...(weight ? { "font-weight": weight } : {}),
    ...(lineHeight ? { "line-height": lineHeight } : {}),
  };
}

function logicalPhysicalSides(property: string, el?: HTMLElement): string[] | null {
  const match = /^(margin|padding|inset)-(inline|block)(?:-(start|end))?$/.exec(property.toLowerCase());
  if (!match) return null;

  const [family, axis, edge] = [match[1]!, match[2]!, match[3]];
  const physicalPrefix = family === "inset" ? "" : `${family}-`;
  const computed = el ? getComputedStyle(el) : null;
  const direction = computed?.direction || el?.dir || "ltr";
  const writingMode = computed?.getPropertyValue("writing-mode").trim() || "horizontal-tb";
  const vertical = writingMode.startsWith("vertical") || writingMode.startsWith("sideways");
  let sides: [string, string];

  if (!vertical) {
    sides = axis === "inline"
      ? direction === "rtl" ? [`${physicalPrefix}right`, `${physicalPrefix}left`] : [`${physicalPrefix}left`, `${physicalPrefix}right`]
      : [`${physicalPrefix}top`, `${physicalPrefix}bottom`];
  } else if (axis === "block") {
    sides = writingMode.includes("-rl")
      ? [`${physicalPrefix}right`, `${physicalPrefix}left`]
      : [`${physicalPrefix}left`, `${physicalPrefix}right`];
  } else {
    sides = direction === "rtl" ? [`${physicalPrefix}bottom`, `${physicalPrefix}top`] : [`${physicalPrefix}top`, `${physicalPrefix}bottom`];
  }

  return edge ? [edge === "start" ? sides[0] : sides[1]] : sides;
}

interface ResolvedDeclaration {
  property: string;
  declaredValue: string;
  sourceProperty?: string;
  tokenName: string | null;
  resolvedValue: string;
  important?: boolean;
  tokens: TokenReference[];
  modifiers: ValueModifier[];
  capability: EditCapability;
  resolvedTokenValue: string;
  diagnostic?: string;
  structure?: BorderStructure;
}

function resolveDeclaration(
  declaration: StyleDeclaration,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
  el?: HTMLElement,
): ResolvedDeclaration[] {
  const logicalSides = logicalPhysicalSides(declaration.property, el);
  if (logicalSides) {
    const rawValues = splitTopLevelWhitespace(declaration.value);
    const values = logicalSides.length === 1
      ? rawValues.length === 1 ? [rawValues[0]!] : null
      : expandTwoValueShorthand(rawValues);
    if (values) {
      return logicalSides.map((property, index) => {
        const declaredValue = values[index]!;
        const resolved = resolveTokenValue(declaredValue, tokenTable, localAliases);
        return {
          property,
          declaredValue,
          sourceProperty: declaration.property,
          tokenName: resolved.tokenName,
          resolvedValue: resolved.resolvedValue,
          important: declaration.important,
          tokens: resolved.tokens,
          modifiers: resolved.modifiers,
          capability: capabilityFor(property, declaredValue),
          resolvedTokenValue: resolved.resolvedValue,
          diagnostic: resolved.cycle ? `custom-property alias cycle includes ${resolved.cycle}` : undefined,
        };
      });
    }
  }

  const borderProperty = declaration.property.toLowerCase();
  if (borderProperty === "border" || /^border-(top|right|bottom|left)$/.test(borderProperty)) {
    const structure = parseBorderShorthand(declaration.value, tokenTable);
    if (structure) {
      const sourceProperty = borderProperty as BorderStructure["sourceProperty"];
      const sidePrefix = sourceProperty === "border" ? "" : `${sourceProperty}-`;
      const scopedStructure = { ...structure, sourceProperty };
      const colorResult = resolveTokenValue(structure.color, tokenTable, localAliases);
      const authored = declaration.value.trim();
      const base = [
        ...(sidePrefix ? [[`${sidePrefix}width`, structure.width], [`${sidePrefix}style`, structure.style], [`${sidePrefix}color`, structure.color]] as const : [
          ["border-width", structure.width], ["border-style", structure.style], ["border-color", structure.color],
          ["border-top-width", structure.width], ["border-right-width", structure.width], ["border-bottom-width", structure.width], ["border-left-width", structure.width],
          ["border-top-style", structure.style], ["border-right-style", structure.style], ["border-bottom-style", structure.style], ["border-left-style", structure.style],
          ["border-top-color", structure.color], ["border-right-color", structure.color], ["border-bottom-color", structure.color], ["border-left-color", structure.color],
        ]),
      ] as const;
      return base.map(([property, component]) => {
        const isColor = property.endsWith("color");
        const resolved = isColor ? colorResult : { tokenName: null, resolvedValue: component, tokens: [], modifiers: [], cycle: undefined };
        return {
          property,
          declaredValue: authored,
          tokenName: resolved.tokenName,
          resolvedValue: resolved.resolvedValue,
          important: declaration.important,
          tokens: isColor ? colorResult.tokens : [],
          modifiers: isColor ? colorResult.modifiers : [],
          capability: "structured" as const,
          resolvedTokenValue: resolved.resolvedValue,
          diagnostic: colorResult.cycle ? `custom-property alias cycle includes ${colorResult.cycle}` : undefined,
          structure: scopedStructure,
        };
      });
    }
  }
  if (borderProperty === "font") {
    const parts = parseFontShorthand(declaration.value);
    if (parts) {
      return Object.entries(parts).map(([property, declaredValue]) => {
        const resolved = resolveTokenValue(declaredValue, tokenTable, localAliases);
        return {
          property,
          declaredValue,
          sourceProperty: "font",
          tokenName: resolved.tokenName,
          resolvedValue: resolved.resolvedValue,
          important: declaration.important,
          tokens: resolved.tokens,
          modifiers: resolved.modifiers,
          capability: capabilityFor(property, declaredValue),
          resolvedTokenValue: resolved.resolvedValue,
          diagnostic: resolved.cycle ? `custom-property alias cycle includes ${resolved.cycle}` : undefined,
        };
      });
    }
  }
  const sides = SPACING_SIDES[declaration.property.toLowerCase()];
  if (!sides) {
    const res = resolveTokenValue(declaration.value, tokenTable, localAliases);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      sourceProperty: declaration.property,
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
      tokens: res.tokens,
      modifiers: res.modifiers,
      capability: declaration.property.toLowerCase() === "border" ? "raw" : capabilityFor(declaration.property, declaration.value),
      resolvedTokenValue: res.resolvedValue,
      diagnostic: res.cycle ? `custom-property alias cycle includes ${res.cycle}` : undefined,
    }];
  }

  const rawValues = splitTopLevelWhitespace(declaration.value);
  if (rawValues.length === 0 || rawValues.length > 4) {
    const res = resolveTokenValue(declaration.value, tokenTable, localAliases);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
      tokens: res.tokens,
      modifiers: res.modifiers,
      capability: capabilityFor(declaration.property, declaration.value),
      resolvedTokenValue: res.resolvedValue,
      diagnostic: res.cycle ? `custom-property alias cycle includes ${res.cycle}` : undefined,
    }];
  }

  // A custom property can itself contain a shorthand value, for example
  // `margin: var(--space-set)`. Expand that value before assigning sides.
  const resolvedValues = rawValues.flatMap((rawValue) => {
    const res = resolveTokenValue(rawValue, tokenTable, localAliases);
    const tokenValues = res.tokenName ? splitTopLevelWhitespace(res.resolvedValue) : [];
    if (res.tokenName && /^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(rawValue) && tokenValues.length > 1) {
      return tokenValues.map((resolvedValue) => ({
        declaredValue: rawValue,
        tokenName: res.tokenName,
        resolvedValue,
      }));
    }
    return [{ declaredValue: rawValue, tokenName: res.tokenName, resolvedValue: res.resolvedValue }];
  });
  const sideValues = expandFourValueShorthand(resolvedValues);
  if (!sideValues) {
    const res = resolveTokenValue(declaration.value, tokenTable, localAliases);
    return [{
      property: declaration.property,
      declaredValue: declaration.value.trim(),
      tokenName: res.tokenName,
      resolvedValue: res.resolvedValue,
      important: declaration.important,
      tokens: res.tokens,
      modifiers: res.modifiers,
      capability: capabilityFor(declaration.property, declaration.value),
      resolvedTokenValue: res.resolvedValue,
      diagnostic: res.cycle ? `custom-property alias cycle includes ${res.cycle}` : undefined,
    }];
  }

  return sides.map((property, index) => ({
    property,
    ...sideValues[index]!,
    sourceProperty: declaration.property,
    important: declaration.important,
    tokens: resolveTokenValue(sideValues[index]!.declaredValue, tokenTable, localAliases).tokens,
    modifiers: resolveTokenValue(sideValues[index]!.declaredValue, tokenTable, localAliases).modifiers,
    capability: capabilityFor(property, sideValues[index]!.declaredValue),
    resolvedTokenValue: sideValues[index]!.resolvedValue,
  }));
}

interface LocalAliasCandidate {
  value: string;
  important?: boolean;
  layer?: string;
  specificity: number;
  sourceOrder: number;
}

function compareCascade(
  a: { important?: boolean; layer?: string; specificity: number; sourceOrder: number },
  b: { important?: boolean; layer?: string; specificity: number; sourceOrder: number },
): number {
  const ai = a.important ? 1 : 0;
  const bi = b.important ? 1 : 0;
  if (ai !== bi) return ai - bi;

  // Unlayered author rules outrank layered author rules. This mirrors the
  // declaration comparison below and is sufficient for the local aliases
  // emitted by Tailwind's utility layers.
  const al = a.layer ? 0 : 1;
  const bl = b.layer ? 0 : 1;
  if (al !== bl) return al - bl;
  if (a.specificity !== b.specificity) return a.specificity - b.specificity;
  return a.sourceOrder - b.sourceOrder;
}

function collectLocalAliases(
  el: HTMLElement,
  rules: MatchedRule[],
): ReadonlyMap<string, string> {
  const candidates = new Map<string, LocalAliasCandidate>();
  rules.forEach((rule, index) => {
    if (rule.active === false) return;
    const branch = matchingSelectorBranch(el, rule.selectorText);
    if (!branch) return;
    const sourceOrder = rule.sourceOrder ?? index;
    const specificity = computeSpecificity(branch);
    for (const declaration of rule.declarations) {
      if (!declaration.property.startsWith("--tw-")) continue;
      const candidate: LocalAliasCandidate = {
        value: declaration.value.trim(),
        important: declaration.important,
        layer: rule.layer,
        specificity,
        sourceOrder,
      };
      const previous = candidates.get(declaration.property);
      if (!previous || compareCascade(candidate, previous) >= 0) {
        candidates.set(declaration.property, candidate);
      }
    }
  });

  return new Map([...candidates].map(([name, candidate]) => [name, candidate.value]));
}

export function resolvePropertiesFromRules(
  el: HTMLElement,
  rules: MatchedRule[],
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const map = new Map<string, ResolvedProperty>();
  const localAliases = collectLocalAliases(el, rules);

  // Sort by specificity ascending so rules are processed lowest-first.
  // Map.set() naturally overwrites: higher specificity rules processed later win,
  // and equal-specificity rules get "last in stylesheet order wins" (stable sort).
  const sorted = [...rules].sort((a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0));

  for (const rule of sorted) {
    if (rule.active === false) continue;
    const branch = matchingSelectorBranch(el, rule.selectorText);
    if (!branch) continue;
    const specificity = computeSpecificity(branch);
    for (const decl of rule.declarations) {
      for (const resolved of resolveDeclaration(decl, tokenTable, localAliases, el)) {
        const candidate: ResolvedProperty = {
          property: resolved.property,
          tokenName: resolved.tokenName,
          declaredValue: resolved.declaredValue,
          sourceProperty: resolved.sourceProperty,
          resolvedValue: resolved.resolvedValue,
          authored: resolved.declaredValue,
          computed: "",
          tokens: resolved.tokens,
          modifiers: resolved.modifiers,
          capability: resolved.capability,
          resolvedTokenValue: resolved.resolvedTokenValue,
          diagnostic: resolved.diagnostic,
          structure: resolved.structure,
          confidence: resolved.tokenName ? "probable" : "unknown",
          evidence: {
            selector: branch,
            sourceOrder: rule.sourceOrder,
            specificity,
            important: Boolean(resolved.important),
            layer: rule.layer,
            reason: resolved.tokenName ? "authored declaration references a catalog token" : "no catalog token reference",
          },
        };
        const previous = map.get(resolved.property);
        if (!previous || compareCandidate(candidate, previous) >= 0) map.set(resolved.property, candidate);
      }
    }
  }
  const rows = Array.from(map.values()).slice(0, MAX_PROPERTIES);
  inferTailwindV4ColorOpacity(el, tokenTable, rows);
  return rows;
}

function matchingSelectorBranch(el: Element, selectorText: string): string | null {
  for (const branch of splitTopLevel(selectorText, ",")) {
    try {
      if (el.matches(branch.trim())) return branch.trim();
    } catch { /* invalid/unsupported selector */ }
  }
  return null;
}

function compareCandidate(a: ResolvedProperty, b: ResolvedProperty): number {
  return compareCascade(
    {
      important: a.evidence.important,
      layer: a.evidence.layer,
      specificity: a.evidence.specificity ?? 0,
      sourceOrder: a.evidence.sourceOrder ?? 0,
    },
    {
      important: b.evidence.important,
      layer: b.evidence.layer,
      specificity: b.evidence.specificity ?? 0,
      sourceOrder: b.evidence.sourceOrder ?? 0,
    },
  );
}

function inferTailwindV4ColorOpacity(
  el: HTMLElement,
  tokenTable: TokenTable,
  rows: ResolvedProperty[],
): void {
  const row = rows.find((candidate) => candidate.property === "background-color" || candidate.property === "background");
  if (!row || row.tokenName) return;

  for (const className of Array.from(el.classList)) {
    const match = /^bg-([\w-]+)\/(\d{1,3}%?)$/.exec(className);
    if (!match) continue;
    const baseName = `--color-${match[1]}`;
    const entry = tokenTable[baseName];
    if (!entry || entry.adapter !== "tailwind-v4") continue;
    const rawAlpha = match[2]!;
    const alpha = rawAlpha.endsWith("%") ? rawAlpha : `${rawAlpha}%`;
    const authored = `color-mix(in oklab, var(${baseName}) ${alpha}, transparent)`;
    row.tokenName = baseName;
    row.declaredValue = authored;
    row.authored = authored;
    row.tokens = [{ name: baseName, origin: tokenOrigin(entry) }];
    row.modifiers = [{ kind: "alpha", value: alpha }];
    row.capability = "color";
    row.resolvedTokenValue = entry.value;
    row.evidence.reason = "Tailwind v4 opacity utility mapped to its base catalog token";
    row.confidence = "probable";
    return;
  }
}

function parseDeclarations(cssText: string): StyleDeclaration[] {
  const out: StyleDeclaration[] = [];
  for (const part of cssText.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const property = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!property || !value) continue;
    const important = /!\s*important\s*$/i.test(value);
    out.push({ property, value: value.replace(/!\s*important\s*$/i, "").trim(), important });
  }
  return out;
}

function selectorKey(selector: string): string {
  return selector.trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,])\s*/g, "$1");
}

/**
 * CSSOM is allowed to canonicalise values (`.875rem` → `0.875rem`, and it can
 * reorder a `calc()` sum). For in-document style elements we can recover the
 * author text safely enough to present it back to the inspector. Linked or
 * inaccessible stylesheets continue through the CSSOM fallback below.
 */
function rawDeclarationsBySelector(sheet: CSSStyleSheet): Map<string, StyleDeclaration[][]> {
  const owner = sheet.ownerNode;
  if (!(owner instanceof HTMLStyleElement) || !owner.textContent) return new Map();

  const declarations = new Map<string, StyleDeclaration[][]>();
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(owner.textContent)) !== null) {
    const selector = match[1]!.trim();
    if (!selector || selector.startsWith("@")) continue;
    const parsed = parseDeclarations(match[2]!);
    if (parsed.length === 0) continue;
    const key = selectorKey(selector);
    const entries = declarations.get(key) ?? [];
    entries.push(parsed);
    declarations.set(key, entries);
  }
  return declarations;
}

function extractParenContent(s: string, openIdx: number): { content: string; end: number } {
  let depth = 0;
  let i = openIdx;
  while (i < s.length && s[i] !== "(") i++;
  if (i >= s.length) return { content: "", end: openIdx };
  depth = 1;
  const start = i + 1;
  i++;
  while (i < s.length && depth > 0) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return { content: s.slice(start, i - 1).trim(), end: i };
}

export function computeSpecificity(selectorText: string): number {
  let s = selectorText.trim();

  // Handle comma-separated selectors: use the max specificity of any part
  const commaParts = splitTopLevel(s, ",");
  if (commaParts.length > 1) {
    let max = 0;
    for (const part of commaParts) {
      const spec = computeSpecificity(part);
      if (spec > max) max = spec;
    }
    return max;
  }

  let idCount = 0;
  let classCount = 0;
  let elementCount = 0;

  // Split by combinators (space, >, +, ~) to get individual compound selectors
  // but only at the top level (not inside :not()/:is()/:has()/:where() parens)
  const compounds = splitTopLevel(s);

  for (const compound of compounds) {
    let cs = compound;

    // Handle :not(), :is(), :has(), :where() — extract and remove the entire
    // :name(...) block including args so their content isn't double-counted
    // by subsequent class/ID/element regexes
    const pseudoFuncRe = /:(not|is|has|where)\(/g;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = pseudoFuncRe.exec(cs)) !== null) {
      const name = funcMatch[1]!;
      const openIdx = funcMatch.index;
      const { content, end } = extractParenContent(cs, openIdx + funcMatch[0].length - 1);
      const argSpec = content ? computeSpecificity(content) : 0;
      if (name !== "where") {
        idCount += Math.floor(argSpec / 1000000);
        classCount += Math.floor(argSpec / 10000) % 100;
        elementCount += Math.floor(argSpec / 100) % 100;
      }
      // Remove the entire :name(...) block completely so args aren't re-counted
      cs = cs.slice(0, openIdx) + " " + cs.slice(end);
      // Reset regex lastIndex since we modified the string
      pseudoFuncRe.lastIndex = openIdx + 1;
    }

    // Now cs has had all :not()/:is()/:has()/:where() removed
    // Count ID selectors
    cs = cs.replace(/#[\w-]+/g, () => { idCount++; return " "; });

    // Count class selectors
    cs = cs.replace(/\.[\w-]+/g, () => { classCount++; return " "; });

    // Count attribute selectors
    cs = cs.replace(/\[[^\]]*\]/g, () => { classCount++; return " "; });

    // Count pseudo-elements (double colon) — remove after counting
    cs = cs.replace(/::[\w-]+/g, () => { elementCount++; return " "; });

    // Count pseudo-classes (single colon) — must be done AFTER pseudo-elements
    // since single-colon legacy pseudo-elements like :before are also matched here
    cs = cs.replace(/:(?!:)[\w-]+/g, () => { classCount++; return " "; });

    // Remaining words are element type selectors (excluding * and &)
    const words = cs.split(/[\s>+~]+/).filter((w) => w && w !== "*" && w !== "&");
    elementCount += words.length;
  }

  return idCount * 1000000 + classCount * 10000 + elementCount * 100;
}

// Split a selector on combinators (space, >, +, ~), respecting nesting in parens.
// If sep is given, splits on that character instead (for comma splitting).
function splitTopLevel(s: string, sep?: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (depth === 0 && sep && s[i] === sep) {
      parts.push(s.slice(start, i));
      start = i + 1;
    } else if (depth === 0 && !sep && (s[i] === " " || s[i] === ">" || s[i] === "+" || s[i] === "~")) {
      // Only split on combinators that have non-space around them
      // If previous char was also a combinator, skip
      if (i > start) {
        parts.push(s.slice(start, i).trim());
      }
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function collectRules(doc: Document): { rules: MatchedRule[]; inaccessible: boolean } {
  const out: MatchedRule[] = [];
  let inaccessible = false;
  let sourceOrder = 0;
  const walkRules = (
    rules: CSSRuleList,
    rawDeclarations: Map<string, StyleDeclaration[][]>,
    active = true,
    layer?: string,
  ): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        let cssText: string;
        try {
          cssText = rule.style.cssText ?? "";
        } catch {
          continue;
        }
        const raw = rawDeclarations.get(selectorKey(rule.selectorText))?.shift();
        out.push({
          selectorText: rule.selectorText,
          specificity: computeSpecificity(rule.selectorText),
          declarations: raw ?? parseDeclarations(cssText),
          sourceOrder: sourceOrder++,
          active,
          layer,
        });
      } else if ("cssRules" in rule) {
        try {
          const record = rule as unknown as { cssRules: CSSRuleList; conditionText?: string; name?: string };
          let childActive = active;
          const cssText = rule.cssText ?? "";
          if (cssText.startsWith("@media") && record.conditionText) childActive = active && doc.defaultView!.matchMedia(record.conditionText).matches;
          else if (cssText.startsWith("@supports") && record.conditionText) childActive = active && (doc.defaultView?.CSS?.supports(record.conditionText) ?? false);
          else if (cssText.startsWith("@container")) childActive = false; // CSSOM cannot reliably evaluate the queried container.
          const childLayer = cssText.startsWith("@layer") ? record.name ?? cssText.slice(6, cssText.indexOf("{")).trim() : layer;
          walkRules(record.cssRules, rawDeclarations, childActive, childLayer);
        } catch {
          continue;
        }
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walkRules(sheet.cssRules, rawDeclarationsBySelector(sheet));
    } catch {
      inaccessible = true;
    }
  }
  return { rules: out, inaccessible };
}

const INHERITED_PROPERTIES = new Set([
  "color", "font", "font-family", "font-size", "font-style", "font-variant", "font-weight",
  "letter-spacing", "line-height", "text-align", "text-indent", "text-transform", "visibility",
  "white-space", "word-spacing", "cursor",
]);

function resolveInheritedProperties(
  el: HTMLElement,
  rules: MatchedRule[],
  tokenTable: TokenTable,
  result: ResolvedProperty[],
  inaccessible: boolean,
): ResolvedProperty[] {
  const computed = getComputedStyle(el);
  const seenProperties = new Set(result.map((p) => p.property));
  const rulesSorted = [...rules].sort((a, b) => b.specificity - a.specificity);
  let ancestor: HTMLElement | null = el.parentElement;
  while (ancestor) {
    const ancestorComputed = getComputedStyle(ancestor);
    for (const candidate of resolvePropertiesFromRules(ancestor, rulesSorted, tokenTable)) {
      if (seenProperties.has(candidate.property)) continue;
      if (!INHERITED_PROPERTIES.has(candidate.property) && !candidate.property.startsWith("--")) continue;
      const ancestorVal = ancestorComputed.getPropertyValue(candidate.property).trim();
      const elVal = computed.getPropertyValue(candidate.property).trim();
      if (ancestorVal && ancestorVal === elVal) {
        result.push({
          ...candidate,
          resolvedValue: elVal,
          confidence: candidate.tokenName && candidateMatchesPainted(ancestor, candidate, ancestorVal) && !inaccessible && !candidate.evidence.layer ? "exact" : candidate.tokenName ? "probable" : "unknown",
          evidence: { ...candidate.evidence, inheritedFrom: ancestor.tagName.toLowerCase(), inaccessibleStylesheet: inaccessible || undefined, reason: "inherited property traced through the ancestor cascade" },
        });
        seenProperties.add(candidate.property);
      }
    }
    ancestor = ancestor.parentElement;
  }

  return result;
}

export function getResolvedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules, inaccessible } = collectRules(doc);
  const result = resolvePropertiesFromRules(el, rules, tokenTable);
  const computed = getComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv) {
      prop.resolvedValue = cv;
      prop.computed = cv;
      const validated = candidateMatchesPainted(el, prop, cv);
      prop.confidence = validated && !inaccessible && !prop.evidence.layer ? "exact" : prop.tokenName ? "probable" : "unknown";
      prop.evidence.inaccessibleStylesheet = inaccessible || undefined;
      prop.evidence.reason = prop.tokenName
        ? (validated ? "authored token declaration validated against computed style" : "authored token candidate could not be proven uniquely")
        : "painted value has no attributable catalog token";
    }
  }

  // Inline declarations participate in the cascade and are explicit evidence,
  // but token attribution is only exact when the authored inline value uses a known token.
  for (const property of Array.from(el.style)) {
    const value = el.style.getPropertyValue(property);
    const declarations = resolveDeclaration({
      property,
      value,
      important: el.style.getPropertyPriority(property) === "important",
    }, tokenTable, EMPTY_LOCAL_ALIASES, el);
    for (const declaration of declarations) {
      const painted = computed.getPropertyValue(declaration.property);
      const row: ResolvedProperty = {
        property: declaration.property,
        tokenName: declaration.tokenName,
        declaredValue: declaration.declaredValue,
        sourceProperty: declaration.sourceProperty,
        resolvedValue: painted,
        authored: declaration.declaredValue,
        computed: painted,
        tokens: declaration.tokens,
        modifiers: declaration.modifiers,
        capability: declaration.capability,
        resolvedTokenValue: declaration.resolvedValue,
        diagnostic: undefined,
        confidence: "unknown",
        evidence: { selector: "[style]", specificity: 100000000, important: Boolean(declaration.important), inaccessibleStylesheet: inaccessible || undefined, reason: declaration.tokenName ? "inline token declaration validated against computed style" : "inline declaration contains no catalog token" },
      };
      if (declaration.tokenName && candidateMatchesPainted(el, row, painted)) {
        row.confidence = inaccessible ? "probable" : "exact";
        row.evidence.reason = "inline token declaration validated against computed style";
      }
      const index = result.findIndex((item) => item.property === declaration.property);
      if (index >= 0) result[index] = row; else result.push(row);
    }
  }

  return resolveInheritedProperties(el, rules, tokenTable, result, inaccessible);
}

const INTERACTION_SELECTOR = /:(hover|active|focus-visible|focus|disabled)(?:\b|\()/g;

function selectorForState(selector: string, state: InteractionState): string | null {
  const states = new Set<string>();
  INTERACTION_SELECTOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERACTION_SELECTOR.exec(selector)) !== null) states.add(match[1]!);
  if (state === "base") return states.size === 0 ? selector : null;
  if (!states.has(state)) return states.size === 0 ? selector : null;
  // CSSOM cannot ask the browser whether a hypothetical pseudo-class matches.
  // Removing interaction pseudo-classes gives the authored rule a stable
  // element match for inspection. The real rule remains untouched.
  return selector.replace(INTERACTION_SELECTOR, "");
}

/**
 * Resolve the authored cascade for a chosen interaction state without relying
 * on the pointer's current location. This is intentionally attribution-first:
 * values with no authored declaration still fall back to the browser's live
 * computed value in the field layer.
 */
export function getResolvedPropertiesForState(
  el: HTMLElement,
  tokenTable: TokenTable,
  state: InteractionState,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const stateRules = rules.flatMap((rule) => {
    const selectorText = selectorForState(rule.selectorText, state);
    return selectorText ? [{ ...rule, selectorText }] : [];
  });
  const result = resolvePropertiesFromRules(el, stateRules, tokenTable);
  return resolveInheritedProperties(el, stateRules, tokenTable, result, false);
}

export function getAvailableInteractionStates(el: HTMLElement): InteractionState[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const available: InteractionState[] = ["base"];
  for (const state of INTERACTION_STATES) {
    const relevant = rules.some((rule) => {
      const selector = selectorForState(rule.selectorText, state);
      return selector !== null && rule.selectorText.includes(`:${state}`) && matchingSelectorBranch(el, selector) !== null;
    });
    if (relevant) available.push(state);
  }
  return available;
}

const TRANSIENT_SELECTOR = /:(?:hover|active|focus|focus-visible|focus-within|visited|target)(?:\b|\()/;

/**
 * Finds the authored token-backed declaration beneath a transient interaction
 * state. This keeps an editor linked to its stable token when selection occurs
 * while the element is hovered, while getResolvedProperties remains honest
 * about the value currently painted by that transient rule.
 */
export function getStableTokenProperty(
  el: HTMLElement,
  properties: string[],
  tokenTable: TokenTable,
): ResolvedProperty | null {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectRules(doc);
  const stableRules = rules.filter((rule) => !TRANSIENT_SELECTOR.test(rule.selectorText));
  const rows = resolvePropertiesFromRules(el, stableRules, tokenTable);
  for (const property of properties) {
    const row = rows.find((candidate) => candidate.property === property && candidate.tokenName);
    if (row) return row;
  }
  return null;
}
import { useEffect, useState } from "react";
import type { SelectedElement } from "../selectionStore.ts";

export function useResolvedPropertiesDebounced(
  selected: SelectedElement | null,
  state: InteractionState = "base",
): ResolvedProperty[] {
  const [rows, setRows] = useState<ResolvedProperty[]>([]);
  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      setRows(getResolvedPropertiesForState(selected.domElement, getTokenTable(), state));
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [selected, state]);
  return rows;
}
