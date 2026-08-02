import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";
import { tokenCatalog, tokens } from "virtual:design-tokens";
import { INTERACTION_STATES } from "../styleState.ts";
import type { InteractionState } from "../styleState.ts";
import { getElementComputedStyle } from "../domRealm.ts";
import {
  collectRules as collectCssomRules,
  documentRevisions as getDocumentRevisions,
  registerResolutionElement,
} from "./resolution/cssomCollector.ts";
import { computeSpecificity } from "./resolution/selectorSemantics.ts";
export { invalidateStyleResolutionCache } from "./resolution/cssomCollector.ts";
export { computeSpecificity } from "./resolution/selectorSemantics.ts";
import type {
  AtRuleContext,
  BorderStructure,
  ColorOpacity,
  EditCapability,
  MatchedRule,
  ResolvedProperty,
  StyleDeclaration,
  TokenOrigin,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "./resolution/types.ts";

export type {
  AttributionEvidence,
  AtRuleContext,
  BorderStructure,
  ColorOpacity,
  EditCapability,
  MatchedRule,
  ResolvedProperty,
  StyleDeclaration,
  TokenOrigin,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "./resolution/types.ts";

const MAX_PROPERTIES = 100;
const VAR_REF = /var\(\s*(--[\w-]+)/g;
const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();
const SPACING_SIDES: Record<string, readonly string[]> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
};
const BORDER_RADIUS_CORNERS: Record<string, readonly string[]> = {
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
};

const tokenTableMemo = new WeakMap<TokenEntry[], TokenTable>();

export function buildTokenTable(entries: TokenEntry[]): TokenTable {
  const cached = tokenTableMemo.get(entries);
  if (cached) return cached;
  const table: TokenTable = {};
  for (const entry of entries) {
    table[entry.name] = entry;
    if (entry.cssName) table[entry.cssName] = entry;
  }
  tokenTableMemo.set(entries, table);
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
  if (/\b(?:min|max|clamp|env|anchor-size)\s*\(/.test(v)) return "raw";
  if (["margin", "padding", "inset", "inset-block", "inset-inline"].includes(p)
    || p.startsWith("margin-") || p.startsWith("padding-") || p.startsWith("inset-")) return "box-sides";
  if (p === "border" || p.endsWith("-border") || p === "border-color" || p.endsWith("-border-color")) return "structured";
  if (p === "color" || /(^|-)color$/.test(p) || p === "background-color" || p === "fill" || p === "stroke") return "color";
  if (/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(v)) return "atomic";
  if (p === "font" || /(gradient|shadow|transform|transition|animation|grid|background)/.test(p)
    || (v.includes(",") && !/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/.test(v))) return "composite";
  if (/\b(min|max|clamp|color-mix)\s*\(/.test(v)) return "raw";
  if (/^[+-]?(?:\d*\.)?\d+(?:[a-z%]+)?$/i.test(v)
    || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|transparent|currentcolor)/.test(v)) return "atomic";
  return "raw";
}

/**
 * Returns true when a `calc()` expression is safe to treat as a simple
 * numeric value.  We exclude percentages, viewport units, and font-relative
 * units because those depend on context the browser cannot freeze into a
 * single pixel value safely.
 */
function canBecomeNumeric(value: string): boolean {
  const v = value.trim();
  if (/\b(?:min|max|clamp|env|anchor-size)\s*\(/i.test(v)) return false;
  const m = /^calc\s*\(/i.exec(v);
  if (!m) return false;
  const inner = v.slice(m[0].length, -1).trim();
  const withoutVars = inner.replace(/var\([^)]+\)/g, "");
  return !/\b\d+(?:\.\d+)?(?:%|vw|vh|vmin|vmax|dvw|dvh|sv[lw]h|lv[lw]h|[ce]m|ex|ch)\b/i.test(withoutVars);
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

function isCustomPropertyToken(definition: TokenDefinition): boolean {
  return definition.cssName.startsWith("--");
}

function entryFromDefinition(definition: TokenDefinition, value: string): TokenEntry {
  return {
    name: definition.name,
    cssName: definition.cssName,
    value,
    source: definition.declarations[0]?.source ?? "",
    cssValue: definition.cssValue,
    adapter: definition.adapter,
    origin: definition.origin,
    editable: definition.editable,
  };
}

interface TokenEntriesCacheEntry {
  elementRevision: number;
  stylesheetRevision: number;
  definitions: TokenDefinition[];
  entries: TokenEntry[];
  table: TokenTable;
}

const tokenEntriesCache = new WeakMap<HTMLElement, TokenEntriesCacheEntry>();

function registerWithAncestors(el: HTMLElement): void {
  let current: HTMLElement | null = el;
  while (current) {
    registerResolutionElement(current);
    current = current.parentElement;
  }
}

/**
 * The build-time catalog is intentionally an inventory of every project token.
 * Element edits must instead use only custom properties resolved in that
 * element's cascade; a token defined by a lazy stylesheet is not usable until
 * that stylesheet is attached to the document. Entries (and their table) are
 * cached per element until the element or stylesheet revision changes.
 */
export function getAvailableTokenEntriesForElement(
  el: HTMLElement,
  definitions: TokenDefinition[] = tokenCatalog,
): TokenEntry[] {
  const revisions = getDocumentRevisions(el.ownerDocument ?? document);
  const cached = tokenEntriesCache.get(el);
  if (cached && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.definitions === definitions) {
    return cached.entries;
  }
  registerWithAncestors(el);
  const computed = getElementComputedStyle(el);
  const available = definitions.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) {
      // Literal adapters (for example Tailwind v3) do not have a browser
      // custom property to probe. Their adapter owns their availability.
      return [entryFromDefinition(definition, definition.declarations[0]?.value ?? "")];
    }
    const value = computed.getPropertyValue(definition.cssName).trim();
    return value ? [entryFromDefinition(definition, value)] : [];
  });
  const intermediateTable = buildTokenTable(available);
  const entries = available.map((entry) => ({
    ...entry,
    value: resolveTokenValue(entry.value, intermediateTable).resolvedValue,
  }));
  tokenEntriesCache.set(el, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    definitions,
    entries,
    table: buildTokenTable(entries),
  });
  return entries;
}

/** @deprecated Use getAvailableTokenEntriesForElement for edit candidates. */
export function getTokenEntriesForElement(el: HTMLElement): TokenEntry[] {
  return getAvailableTokenEntriesForElement(el);
}

export function getAvailableTokenTableForElement(el: HTMLElement): TokenTable {
  const revisions = getDocumentRevisions(el.ownerDocument ?? document);
  const cached = tokenEntriesCache.get(el);
  if (cached && cached.definitions === tokenCatalog
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet) {
    return cached.table;
  }
  return buildTokenTable(getAvailableTokenEntriesForElement(el));
}

function sourceFile(source: string): string {
  return source.replace(/:\d+$/, "").split(/[?#]/, 1)[0] ?? source;
}

function normalizedPath(value: string): string {
  return decodeURIComponent(value).replace(/\\/g, "/").replace(/^file:\/\//, "").replace(/\/+$/, "");
}

function loadedStylesheetSources(doc: Document): string[] {
  return Array.from(doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style[data-vite-dev-id], link[rel~="stylesheet"][href]',
  )).flatMap((node) => {
    const source = node instanceof HTMLStyleElement
      ? node.dataset.viteDevId
      : node.getAttribute("href");
    return source ? [normalizedPath(source.split(/[?#]/, 1)[0] ?? source)] : [];
  });
}

function isLoadedCssSource(source: string, loadedSources: string[]): boolean {
  const file = sourceFile(source);
  if (!/\.css$/i.test(file) || loadedSources.length === 0) return true;
  const normalizedFile = normalizedPath(file);
  return loadedSources.some((loaded) => loaded === normalizedFile
    || loaded.endsWith(`/${normalizedFile}`)
    || normalizedFile.endsWith(`/${loaded}`));
}

/**
 * Produces the page catalog used by the global Tokens tab. It retains the
 * build-time inventory separately, while removing declarations from CSS files
 * that Vite has not loaded for this page (such as lazy route stylesheets).
 */
export function getAvailableTokenCatalog(
  root: HTMLElement = document.documentElement,
  definitions: TokenDefinition[] = tokenCatalog,
): TokenDefinition[] {
  const computed = getElementComputedStyle(root);
  const loadedSources = loadedStylesheetSources(root.ownerDocument ?? document);
  return definitions.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) return [definition];
    if (!computed.getPropertyValue(definition.cssName).trim()) return [];
    const declarations = definition.declarations.filter((declaration) =>
      isLoadedCssSource(declaration.source, loadedSources));
    return declarations.length > 0 ? [{ ...definition, declarations }] : [];
  });
}

function normalizeInElementContext(el: HTMLElement, property: string, value: string): string {
  const doc = el.ownerDocument;
  const probe = doc.createElement(el.tagName.toLowerCase());
  probe.setAttribute("data-design-tool", "attribution-probe");
  probe.style.setProperty(property, value, "important");
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) doc.body.appendChild(probe);
  const normalized = getElementComputedStyle(probe).getPropertyValue(property).trim();
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
  // Tailwind's generated --tw-* properties are implementation aliases. Keep
  // attributing those to the catalog token they point at. Other local custom
  // properties are authored tokens in the selected element's scope, even when
  // their leaf value is a literal and therefore has no catalog entry.
  if (ref.startsWith("--tw-")) {
    return inner.tokenName
      ? { known: true, tokenName: inner.tokenName, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? null, cycle: inner.cycle }
      : { known: false, tokenName: null, resolvedValue: `var(${ref})`, leafTokenName: null, cycle: inner.cycle };
  }
  return {
    known: true,
    tokenName: ref,
    resolvedValue: inner.resolvedValue,
    leafTokenName: inner.leafTokenName ?? ref,
    cycle: inner.cycle,
  };
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

const MIX_PERCENTAGE_OR_TOKEN = /^(?:\d+\.?\d*|\.\d+)%$|^var\([\s\S]+\)$/i;

function formatOpacityPercent(value: number): string {
  return `${String(Number(value.toFixed(4)))}%`;
}

function parseOpacityPercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isPercent = trimmed.endsWith("%");
  const numeric = Number(isPercent ? trimmed.slice(0, -1).trim() : trimmed);
  if (!Number.isFinite(numeric)) return null;
  const percent = isPercent ? numeric : numeric * 100;
  return Math.max(0, Math.min(100, percent));
}

export function normalizeColorOpacity(value: string): string | null {
  const percent = parseOpacityPercent(value);
  return percent === null ? null : formatOpacityPercent(percent);
}

function topLevelSlashIndex(value: string): number {
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "/" && depth === 0) return index;
  }
  return -1;
}

function resolveOpacityComponent(
  authoredValue: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string>,
): Pick<ColorOpacity, "value" | "authoredValue" | "tokenName" | "token"> | null {
  const trimmed = authoredValue.trim();
  const tokenResult = /^var\(/i.test(trimmed) ? resolveTokenValue(trimmed, tokenTable, localAliases) : null;
  const localName = extractVarCalls(trimmed)[0]?.name;
  const localValue = localName ? localAliases.get(localName) : undefined;
  const fallback = extractVarCalls(trimmed)[0]?.fallback;
  const resolved = localValue
    ?? (tokenResult?.resolvedValue && !/^var\(/i.test(tokenResult.resolvedValue)
    ? tokenResult.resolvedValue
    : fallback ?? trimmed);
  const value = normalizeColorOpacity(resolved);
  if (value === null) return null;
  const token = tokenResult?.tokens.find((candidate) => candidate.name === tokenResult.tokenName)
    ?? tokenResult?.tokens[0];
  return {
    value,
    authoredValue: trimmed,
    tokenName: tokenResult?.tokenName ?? null,
    token: localName?.startsWith("--tw-") ? undefined : token,
  };
}

interface ColorMixItem {
  color: string;
  percentage: string | null;
}

function parseColorMixItem(value: string): ColorMixItem {
  const parts = splitTopLevelWhitespace(value.trim());
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts.at(-1)!)) {
    return { color: parts.slice(0, -1).join(" "), percentage: parts.at(-1)! };
  }
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts[0]!)) {
    return { color: parts.slice(1).join(" "), percentage: parts[0]! };
  }
  return { color: value.trim(), percentage: null };
}

const COLOR_FUNCTIONS_WITH_ALPHA_SYNTAX = new Set(["rgb", "hsl", "hwb", "lab", "lch", "oklab", "oklch", "color"]);

/** Returns whether a color value carries its own alpha channel. */
export function colorValueHasEmbeddedAlpha(value: string): boolean {
  const trimmed = value.trim();
  if (/^transparent$/i.test(trimmed)) return true;
  if (/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(trimmed)) return true;

  const colorFunction = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(trimmed);
  if (!colorFunction) return false;
  const name = colorFunction[1]!.toLowerCase();
  const body = colorFunction[2]!;
  if (name === "rgba" || name === "hsla") return true;
  if (COLOR_FUNCTIONS_WITH_ALPHA_SYNTAX.has(name)) {
    if (topLevelSlashIndex(body) >= 0) return true;
    if ((name === "rgb" || name === "hsl") && splitTopLevel(body, ",").length >= 4) return true;
  }
  if (name !== "color-mix") return false;

  const parts = splitTopLevel(body, ",");
  return parts.length === 3 && parts.slice(1).some((part) => {
    const item = parseColorMixItem(part);
    return item.color.toLowerCase() === "transparent" || colorValueHasEmbeddedAlpha(item.color);
  });
}

function resolveColorMixOpacity(
  value: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string>,
): ColorOpacity | undefined {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return undefined;
  const parts = splitTopLevel(value.slice(open + 1, close), ",");
  if (parts.length !== 3 || !/^\s*in\s+/i.test(parts[0]!)) return undefined;

  const items = parts.slice(1).map(parseColorMixItem);
  const transparentIndex = items.findIndex((item) => item.color.toLowerCase() === "transparent");
  if (transparentIndex < 0 || items.filter((item) => item.color.toLowerCase() === "transparent").length !== 1) return undefined;
  const colorIndex = transparentIndex === 0 ? 1 : 0;
  const colorItem = items[colorIndex]!;
  const transparentItem = items[transparentIndex]!;

  let component = colorItem.percentage
    ? resolveOpacityComponent(colorItem.percentage, tokenTable, localAliases)
    : null;
  if (!component && transparentItem.percentage) {
    const transparentOpacity = resolveOpacityComponent(transparentItem.percentage, tokenTable, localAliases);
    const transparentPercent = transparentOpacity ? parseOpacityPercent(transparentOpacity.value) : null;
    if (transparentPercent !== null) {
      component = {
        value: formatOpacityPercent(100 - transparentPercent),
        authoredValue: transparentItem.percentage,
        tokenName: transparentOpacity?.tokenName ?? null,
        token: transparentOpacity?.token,
      };
    }
  }
  if (!component) {
    component = { value: "50%", authoredValue: "50%", tokenName: null, token: undefined };
  }
  return { ...component, source: "color-mix" };
}

function resolveColorOpacity(
  value: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string>,
): ColorOpacity | undefined {
  const trimmed = value.trim();
  const hex = /^#([\da-f]{4}|[\da-f]{8})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const alpha = raw.length === 4 ? raw.slice(-1) : raw.slice(-2);
    const max = raw.length === 4 ? 15 : 255;
    return {
      value: formatOpacityPercent((Number.parseInt(alpha, 16) / max) * 100),
      authoredValue: alpha,
      source: "hex",
      tokenName: null,
    };
  }

  const colorFunction = /^(rgba?|hsla?)\(([\s\S]*)\)$/i.exec(trimmed);
  if (colorFunction) {
    const body = colorFunction[2]!;
    const commaParts = splitTopLevel(body, ",");
    const alpha = commaParts.length >= 4
      ? commaParts[3]!
      : (() => {
        const slash = topLevelSlashIndex(body);
        return slash >= 0 ? body.slice(slash + 1).trim() : null;
      })();
    if (alpha) {
      const component = resolveOpacityComponent(alpha, tokenTable, localAliases);
      if (component) {
        return { ...component, source: colorFunction[1]!.toLowerCase().startsWith("rgb") ? "rgb" : "hsl" };
      }
    }
  }

  if (/^color-mix\(/i.test(trimmed)) return resolveColorMixOpacity(trimmed, tokenTable, localAliases);
  return undefined;
}

function replaceFunctionOpacity(value: string, opacity: string): string | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const body = value.slice(open + 1, close);
  const commaParts = splitTopLevel(body, ",");
  if (commaParts.length >= 4) {
    return `${value.slice(0, open + 1)}${commaParts.slice(0, 3).map((part) => part.trim()).join(", ")}, ${opacity}${value.slice(close)}`;
  }
  const slash = topLevelSlashIndex(body);
  if (slash < 0) return null;
  return `${value.slice(0, open + 1)}${body.slice(0, slash).trim()} / ${opacity}${value.slice(close)}`;
}

function replaceColorMixOpacity(value: string, opacity: string): string | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const parts = splitTopLevel(value.slice(open + 1, close), ",");
  if (parts.length !== 3 || !/^\s*in\s+/i.test(parts[0]!)) return null;
  const items = parts.slice(1).map(parseColorMixItem);
  const transparentIndex = items.findIndex((item) => item.color.toLowerCase() === "transparent");
  if (transparentIndex < 0 || items.filter((item) => item.color.toLowerCase() === "transparent").length !== 1) return null;
  const colorIndex = transparentIndex === 0 ? 1 : 0;
  const updated = [...parts];
  const colorItem = items[colorIndex]!;
  const transparentItem = items[transparentIndex]!;
  if (colorItem.percentage) {
    updated[colorIndex + 1] = replaceColorMixItemPercentage(parts[colorIndex + 1]!, opacity);
  } else if (transparentItem.percentage) {
    const percent = parseOpacityPercent(opacity);
    if (percent === null) return null;
    updated[transparentIndex + 1] = replaceColorMixItemPercentage(parts[transparentIndex + 1]!, formatOpacityPercent(100 - percent));
  } else {
    updated[colorIndex + 1] = `${parts[colorIndex + 1]!.trim()} ${opacity}`;
  }
  return `${value.slice(0, open + 1)}${updated.join(", ")}${value.slice(close)}`;
}

function replaceColorMixItemPercentage(item: string, opacity: string): string {
  const parts = splitTopLevelWhitespace(item.trim());
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts.at(-1)!)) {
    return [...parts.slice(0, -1), opacity].join(" ");
  }
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts[0]!)) {
    return [opacity, ...parts.slice(1)].join(" ");
  }
  return `${item.trim()} ${opacity}`;
}

export function replaceColorOpacity(value: string, opacity: string): string | null {
  const normalized = normalizeColorOpacity(opacity);
  if (normalized === null) return null;
  const trimmed = value.trim();
  if (/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/i.test(trimmed)) {
    return normalized === "100%" ? trimmed : `color-mix(in srgb, ${trimmed} ${normalized}, transparent)`;
  }
  const hex = /^#([\da-f]{4}|[\da-f]{8})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const max = raw.length === 4 ? 15 : 255;
    const digits = raw.length === 4 ? 1 : 2;
    const alpha = Math.round((parseOpacityPercent(normalized)! / 100) * max).toString(16).padStart(digits, "0");
    return `${trimmed.slice(0, -digits)}${alpha}`;
  }
  if (/^(?:rgba?|hsla?)\(/i.test(trimmed)) return replaceFunctionOpacity(trimmed, normalized);
  if (/^color-mix\(/i.test(trimmed)) return replaceColorMixOpacity(trimmed, normalized);
  return null;
}

function tokenReferenceName(entry: TokenEntry): string | null {
  const name = entry.cssName ?? entry.name;
  return name.startsWith("--") ? name : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces only the color token in a separable color expression. Keeping this
 * separate from `swapToken` is important for values such as Tailwind's
 * `color-mix(... var(--color-red-500) 10%, transparent)`: a token swap must
 * retain the authored alpha modifier.
 */
export function replaceColorToken(value: string, oldToken: TokenEntry, newToken: TokenEntry): string | null {
  const nextName = tokenReferenceName(newToken);
  if (!nextName) return null;

  for (const oldName of [oldToken.cssName, oldToken.name].filter((name): name is string => Boolean(name))) {
    const reference = new RegExp(`var\\(\\s*${escapeRegExp(oldName)}(?=\\s*(?:,|\\)))`, "i");
    if (reference.test(value)) {
      return value.replace(
        new RegExp(`var\\(\\s*${escapeRegExp(oldName)}(?=\\s*(?:,|\\)))`, "gi"),
        `var(${nextName}`,
      );
    }
  }

  const oldValue = oldToken.cssValue?.trim() || oldToken.value.trim();
  const nextValue = newToken.cssValue?.trim() || newToken.value.trim();
  if (oldValue && nextValue && value.includes(oldValue)) return value.replace(oldValue, nextValue);
  return null;
}

export function resolveTokenValue(
  value: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
): { tokenName: string | null; resolvedValue: string; tokens: TokenReference[]; opacity?: ColorOpacity; modifiers: ValueModifier[]; leafTokenName: string | null; cycle?: string } {
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
  const opacity = resolveColorOpacity(authored, tokenTable, localAliases);
  const modifiers: ValueModifier[] = calls.flatMap((call) => call.fallback ? [{ kind: "fallback" as const, value: call.fallback }] : []);
  if (opacity) modifiers.push({ kind: "alpha", value: opacity.value });
  const inner = resolveTokenValueInner(authored, tokenTable, new Set(), localAliases);
  // An alpha variable is still a token reference, but it is not the color
  // token represented by the field. For example, in
  // `rgb(37 99 235 / var(--opacity-muted))`, the color is literal and only
  // the opacity is token-backed. Keep that distinction in `tokenName` so the
  // UI can render a base color chip only when one actually exists.
  const alphaTokenName = opacity?.tokenName;
  const baseKnown = firstKnown && firstKnown.tokenName !== alphaTokenName ? firstKnown : null;
  const baseInner = inner.tokenName && inner.tokenName !== alphaTokenName ? inner : null;
  const primary = baseKnown ?? baseInner;
  return {
    tokenName: primary?.tokenName ?? (alphaTokenName ? null : firstKnown?.tokenName ?? inner.tokenName),
    resolvedValue: primary?.resolvedValue ?? (alphaTokenName ? authored : inner.resolvedValue),
    tokens: references,
    opacity,
    modifiers,
    leafTokenName: primary?.leafTokenName ?? primary?.tokenName ?? null,
    cycle: primary?.cycle,
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
const BORDER_CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
/** CSS initial values for omitted `border` / `border-*` shorthand components. */
const BORDER_INITIAL = { width: "medium", style: "none", color: "currentcolor" } as const;

export function parseBorderShorthand(value: string, tokenTable: TokenTable): BorderStructure | null {
  const trimmed = value.trim();
  if (!trimmed || BORDER_CSS_WIDE.has(trimmed.toLowerCase())) return null;

  const parts = splitTopLevelWhitespace(trimmed);
  // One to three components in any order; more is multi-value / junk.
  if (parts.length === 0 || parts.length > 3) return null;

  let width = "";
  let style = "";
  let color = "";
  for (const part of parts) {
    const lower = part.toLowerCase();
    // Reject image layers and non-token slash forms (e.g. `red / 10%`).
    if (/^(?:url|image|cross-fade|element|image-set|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\(/i.test(part)) {
      return null;
    }
    if (part.includes("/") && !/^var\(/i.test(part)) return null;

    const varName = /^var\(\s*(--[\w-]+)/i.exec(part)?.[1];
    const varValue = varName ? tokenTable[varName]?.value ?? "" : "";
    const isWidth = BORDER_WIDTHS.has(lower)
      || /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(part)
      || (varName !== undefined && /^(?:0|[+-]?(?:\d*\.)?\d+(?:px|rem|em|%)?)$/i.test(varValue.trim()));
    const isStyle = BORDER_STYLES.has(lower);
    const isColor = COLOR_KEYWORDS.has(lower)
      || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|var\(\s*--)/i.test(part);

    if (!width && isWidth) width = part;
    else if (!style && isStyle) style = part;
    else if (!color && isColor) color = part;
    else return null;
  }

  // Omitted components take the CSS initial for that longhand (not inherited).
  if (!width) width = BORDER_INITIAL.width;
  if (!style) style = BORDER_INITIAL.style;
  if (!color) color = BORDER_INITIAL.color;

  const colorResult = resolveTokenValue(color, tokenTable);
  return {
    kind: "border",
    sourceProperty: "border",
    width,
    style,
    color,
    colorTokenName: colorResult.tokenName,
  };
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
const FONT_STYLE_KEYWORDS = new Set(["normal", "italic", "oblique"]);

interface FontShorthandParts {
  "font-family": string;
  "font-size": string;
  "font-style"?: string;
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
  const style = parts.slice(0, sizeIndex).find((part) => FONT_STYLE_KEYWORDS.has(part.toLowerCase()));
  return {
    "font-family": family,
    "font-size": fontSize,
    ...(style ? { "font-style": style } : {}),
    ...(weight ? { "font-weight": weight } : {}),
    ...(lineHeight ? { "line-height": lineHeight } : {}),
  };
}

function logicalPhysicalSides(property: string, el?: HTMLElement): string[] | null {
  const match = /^(margin|padding|inset)-(inline|block)(?:-(start|end))?$/.exec(property.toLowerCase());
  if (!match) return null;

  const [family, axis, edge] = [match[1]!, match[2]!, match[3]];
  const physicalPrefix = family === "inset" ? "" : `${family}-`;
  const computed = el ? getElementComputedStyle(el) : null;
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
  opacity?: ColorOpacity;
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
          opacity: resolved.opacity,
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
          sourceProperty: declaration.property,
          tokenName: resolved.tokenName,
          resolvedValue: resolved.resolvedValue,
          important: declaration.important,
          tokens: isColor ? colorResult.tokens : [],
          opacity: isColor ? colorResult.opacity : undefined,
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
          opacity: resolved.opacity,
          modifiers: resolved.modifiers,
          capability: capabilityFor(property, declaredValue),
          resolvedTokenValue: resolved.resolvedValue,
          diagnostic: resolved.cycle ? `custom-property alias cycle includes ${resolved.cycle}` : undefined,
        };
      });
    }
  }
  const borderRadiusCorners = BORDER_RADIUS_CORNERS[declaration.property.toLowerCase()];
  if (borderRadiusCorners) {
    const rawValues = splitTopLevelWhitespace(declaration.value);
    if (rawValues.length === 0 || rawValues.length > 4) {
      const res = resolveTokenValue(declaration.value, tokenTable, localAliases);
      return [{
        property: declaration.property,
        declaredValue: declaration.value.trim(),
        sourceProperty: declaration.property,
        tokenName: res.tokenName,
        resolvedValue: res.resolvedValue,
        important: declaration.important,
        tokens: res.tokens,
        opacity: res.opacity,
        modifiers: res.modifiers,
        capability: capabilityFor(declaration.property, declaration.value),
        resolvedTokenValue: res.resolvedValue,
        diagnostic: res.cycle ? `custom-property alias cycle includes ${res.cycle}` : undefined,
      }];
    }

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
    const cornerValues = expandFourValueShorthand(resolvedValues);
    if (!cornerValues) {
      const res = resolveTokenValue(declaration.value, tokenTable, localAliases);
      return [{
        property: declaration.property,
        declaredValue: declaration.value.trim(),
        tokenName: res.tokenName,
        resolvedValue: res.resolvedValue,
        important: declaration.important,
        tokens: res.tokens,
        opacity: res.opacity,
        modifiers: res.modifiers,
        capability: capabilityFor(declaration.property, declaration.value),
        resolvedTokenValue: res.resolvedValue,
        diagnostic: res.cycle ? `custom-property alias cycle includes ${res.cycle}` : undefined,
      }];
    }

    return borderRadiusCorners.map((property, index) => ({
      property,
      ...cornerValues[index]!,
      sourceProperty: declaration.property,
      important: declaration.important,
      tokens: resolveTokenValue(cornerValues[index]!.declaredValue, tokenTable, localAliases).tokens,
      opacity: resolveTokenValue(cornerValues[index]!.declaredValue, tokenTable, localAliases).opacity,
      modifiers: resolveTokenValue(cornerValues[index]!.declaredValue, tokenTable, localAliases).modifiers,
      capability: capabilityFor(property, cornerValues[index]!.declaredValue),
      resolvedTokenValue: cornerValues[index]!.resolvedValue,
    }));
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
      opacity: res.opacity,
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
      opacity: res.opacity,
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
      opacity: res.opacity,
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
    opacity: resolveTokenValue(sideValues[index]!.declaredValue, tokenTable, localAliases).opacity,
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

let containerProbeSequence = 0;

/**
 * Container conditions are element-relative. CSSOM exposes their text but has
 * no `matches` API, so ask the browser by applying an inert custom property to
 * the selected element inside an equivalent temporary @container wrapper.
 */
function matchesContainerQuery(el: HTMLElement, params: string): boolean {
  const doc = el.ownerDocument;
  if (!doc.head || !params) return false;

  const id = ++containerProbeSequence;
  const marker = `data-dt-container-probe-${id}`;
  const property = `--dt-container-probe-${id}`;
  const style = doc.createElement("style");
  style.setAttribute("data-design-tool", "container-probe");
  style.textContent = `@container ${params} { [${marker}] { ${property}: 1; } }`;

  el.setAttribute(marker, "");
  doc.head.appendChild(style);
  try {
    return getElementComputedStyle(el).getPropertyValue(property).trim() === "1";
  } catch {
    return false;
  } finally {
    style.remove();
    el.removeAttribute(marker);
  }
}

function atRulesApplyToElement(el: HTMLElement, atRules: readonly AtRuleContext[] | undefined): boolean {
  const view = el.ownerDocument.defaultView;
  return (atRules ?? []).every((atRule) => {
    if (atRule.kind === "container") return matchesContainerQuery(el, atRule.params);
    if (atRule.kind === "supports") return view?.CSS?.supports(atRule.params) ?? false;
    return true;
  });
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

function specificityForBranch(rule: Pick<MatchedRule, "selectorText" | "specificity">, branch: string): number {
  // Single-branch selectors reuse the specificity collected from CSSOM; the
  // matched branch is the whole selector. Multi-branch selectors need the
  // matched branch's own weight, so recompute per branch.
  return rule.selectorText.includes(",") ? computeSpecificity(branch) : rule.specificity;
}

function collectLocalAliases(
  el: HTMLElement,
  rules: MatchedRule[],
  ruleApplies: (rule: MatchedRule) => boolean,
): ReadonlyMap<string, string> {
  // Custom properties inherit independently of the property being resolved.
  // Resolve the winning declaration separately for each element in the
  // ancestor chain, then let the nearest declaration override inherited ones.
  // This covers local aliases such as --color-error and inherited page tokens
  // such as --color-ink without widening the build-time global catalog.
  const lineage: HTMLElement[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    lineage.push(current);
    current = current.parentElement;
  }

  const aliases = new Map<string, string>();
  for (const element of lineage.reverse()) {
    const candidates = new Map<string, LocalAliasCandidate>();
    rules.forEach((rule, index) => {
      if (rule.active === false) return;
      if (!ruleApplies(rule)) return;
      const branch = matchingSelectorBranch(element, rule.selectorText);
      if (!branch) return;
      const sourceOrder = rule.sourceOrder ?? index;
      const specificity = specificityForBranch(rule, branch);
      for (const declaration of rule.declarations) {
        if (!declaration.property.startsWith("--") || declaration.property.startsWith("--dt-")) continue;
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

    // Inline custom properties are also inherited by descendants. They are
    // explicit cascade winners for their element, so include them at inline
    // specificity without changing the managed-style rule contract.
    for (const property of Array.from(element.style)) {
      if (!property.startsWith("--") || property.startsWith("--dt-")) continue;
      candidates.set(property, {
        value: element.style.getPropertyValue(property).trim(),
        important: element.style.getPropertyPriority(property) === "important",
        specificity: 100000000,
        sourceOrder: Number.MAX_SAFE_INTEGER,
      });
    }

    for (const [name, candidate] of candidates) aliases.set(name, candidate.value);
  }

  return aliases;
}

interface ElementMatch {
  rule: MatchedRule;
  /** The selector actually used for matching (state-stripped for interaction states). */
  selectorText: string;
  branch: string;
  specificity: number;
}

interface ElementResolution {
  element: HTMLElement;
  matched: ElementMatch[];
  aliases: ReadonlyMap<string, string>;
}

interface LineageResolution {
  lineage: HTMLElement[];
  byElement: Map<HTMLElement, ElementResolution>;
}

/**
 * The selector set used by a resolution. Interaction states strip or drop
 * pseudo-class rules, `live` keeps the raw CSSOM rules (used by
 * `getResolvedProperties`), and `stable` drops transient rules (used by
 * `getStableTokenProperty`).
 */
type CascadeTransform = InteractionState | "live" | "stable";

function makeRuleApplies(el: HTMLElement): (rule: MatchedRule) => boolean {
  const matchingContexts = new Map<string, boolean>();
  return (rule: MatchedRule): boolean => {
    const atRules = rule.atRules;
    if (!atRules || atRules.length === 0) return true;
    const key = JSON.stringify(atRules);
    const cached = matchingContexts.get(key);
    if (cached !== undefined) return cached;
    const result = atRulesApplyToElement(el, atRules);
    matchingContexts.set(key, result);
    return result;
  };
}

const TRANSIENT_SELECTOR = /:(?:hover|active|focus|focus-visible|focus-within|visited|target)(?:\b|\()/;

const transformedRulesMemo = new WeakMap<MatchedRule[], Map<CascadeTransform, Array<{ rule: MatchedRule; selectorText: string }>>>();

function rulesForTransform(rules: MatchedRule[], transform: CascadeTransform): Array<{ rule: MatchedRule; selectorText: string }> {
  let byTransform = transformedRulesMemo.get(rules);
  if (!byTransform) {
    byTransform = new Map();
    transformedRulesMemo.set(rules, byTransform);
  }
  const cached = byTransform.get(transform);
  if (cached) return cached;
  let transformed: Array<{ rule: MatchedRule; selectorText: string }>;
  if (transform === "live") {
    transformed = rules.map((rule) => ({ rule, selectorText: rule.selectorText }));
  } else if (transform === "stable") {
    transformed = rules
      .filter((rule) => !TRANSIENT_SELECTOR.test(rule.selectorText))
      .map((rule) => ({ rule, selectorText: rule.selectorText }));
  } else {
    transformed = rules.flatMap((rule) => {
      const selectorText = selectorForState(rule.selectorText, transform);
      return selectorText ? [{ rule, selectorText }] : [];
    });
  }
  byTransform.set(transform, transformed);
  return transformed;
}

function isElementSensitiveSelector(selector: string): boolean {
  let attributeDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (attributeDepth > 0) {
      if (character === '"' || character === "'") quote = character;
      else if (character === "[") attributeDepth++;
      else if (character === "]") attributeDepth--;
      continue;
    }
    if (character === "[") {
      attributeDepth = 1;
      continue;
    }
    if (character === "+" || character === "~") return true;
    if (character !== ":") continue;
    if (selector[index + 1] === ":") return true;
    const pseudo = /^[A-Za-z-]+/.exec(selector.slice(index + 1))?.[0];
    // :root is represented by the complete ancestor lineage. Other
    // pseudo-classes can vary per concrete element without an attribute or
    // sibling mutation (for example :checked, :visited, and :target).
    if (pseudo && pseudo.toLowerCase() !== "root") return true;
  }
  return false;
}

interface SourceSiteMatchBuckets {
  cacheable: Array<{ rule: MatchedRule; selectorText: string }>;
  elementSensitive: Array<{ rule: MatchedRule; selectorText: string }>;
}

const sourceSiteMatchBucketsMemo = new WeakMap<MatchedRule[], Map<CascadeTransform, SourceSiteMatchBuckets>>();

function sourceSiteMatchBuckets(rules: MatchedRule[], transform: CascadeTransform): SourceSiteMatchBuckets {
  let byTransform = sourceSiteMatchBucketsMemo.get(rules);
  if (!byTransform) {
    byTransform = new Map();
    sourceSiteMatchBucketsMemo.set(rules, byTransform);
  }
  const cached = byTransform.get(transform);
  if (cached) return cached;
  const cacheable: Array<{ rule: MatchedRule; selectorText: string }> = [];
  const elementSensitive: Array<{ rule: MatchedRule; selectorText: string }> = [];
  for (const entry of rulesForTransform(rules, transform)) {
    (isElementSensitiveSelector(entry.selectorText) ? elementSensitive : cacheable).push(entry);
  }
  const buckets = { cacheable, elementSensitive };
  byTransform.set(transform, buckets);
  return buckets;
}

const SOURCE_SITE_CACHE_MAX = 4096;
interface SourceSiteMatchCacheEntry {
  elementRevision: number;
  stylesheetRevision: number;
  matched: ElementMatch[];
}

let sourceSiteMatchCaches = new WeakMap<Document, Map<string, SourceSiteMatchCacheEntry>>();
let sourceSiteMatchCacheEntries = 0;
const relationshipMatchCaches = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();
const concreteElementMatchCaches = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();

/** Test hook: clears the per-source-site matched-rule cache. */
export function resetSourceSiteMatchCache(): void {
  sourceSiteMatchCaches = new WeakMap();
  sourceSiteMatchCacheEntries = 0;
}

/** Test hook: number of distinct cached source-site match sets. */
export function sourceSiteMatchCacheSize(): number {
  return sourceSiteMatchCacheEntries;
}

/**
 * Captures selector-relevant state without serializing the whole document.
 * Element and ancestor attributes cover the common source-site selectors while
 * child/sibling-sensitive selectors are handled conservatively below.
 */
function sourceSiteContextKey(el: HTMLElement): string {
  const lineage: string[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    const attributes = Array.from(current.attributes)
      .filter((attribute) => attribute.name !== "data-dt-renderer-id")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .join("\u0002");
    lineage.push(`${current.tagName}\u0003${attributes}`);
    current = current.parentElement;
  }
  return lineage.join("\u0001");
}

/**
 * Source-site identity key for the matched-rule cache. The element's class is
 * part of the key because sibling instances of a source site can carry
 * different classes (for example rows in a large list), which changes which
 * rules match even though their `data-cid`/`data-src` are identical.
 */
function sourceSiteKey(el: HTMLElement, transform: CascadeTransform): string {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const instance = el.getAttribute("data-dt-instance") ?? "";
  const className = typeof el.className === "string" ? el.className : "";
  return `${cid}\u0000${src}\u0000${instance}\u0000${className}\u0000${transform}`;
}

function matchRuleForElement(el: HTMLElement, entry: { rule: MatchedRule; selectorText: string }): ElementMatch | null {
  const branch = matchingSelectorBranch(el, entry.selectorText);
  if (!branch) return null;
  return {
    rule: entry.rule,
    selectorText: entry.selectorText,
    branch,
    specificity: specificityForBranch({ ...entry.rule, selectorText: entry.selectorText }, branch),
  };
}

/**
 * Matches every transformed rule against one element. For elements carrying a
 * source-site identity (`data-cid`) the selector-match result is cached per
 * `(document, data-cid, data-src, data-dt-instance, transform, element and
 * stylesheet revision, context)` so repeated selections and equivalent sibling instances of the
 * same source site reuse the matched rule set. Elements without a stable
 * identity, or selectors that depend on unsupported relationships, are matched
 * fresh on every call.
 */
function getCachedElementMatches(el: HTMLElement, rules: MatchedRule[], transform: CascadeTransform): ElementMatch[] {
  const { cacheable, elementSensitive } = sourceSiteMatchBuckets(rules, transform);
  const collect = (entries: Array<{ rule: MatchedRule; selectorText: string }>): ElementMatch[] => {
    const matched: ElementMatch[] = [];
    for (const entry of entries) {
      if (entry.rule.active === false) continue;
      const match = matchRuleForElement(el, entry);
      if (match) matched.push(match);
    }
    return matched;
  };
  const cid = el.getAttribute("data-cid");
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  if (!cid || cacheable.length === 0) {
    const entries = cacheable.length === 0 ? elementSensitive : [...cacheable, ...elementSensitive];
    let cache = concreteElementMatchCaches.get(el);
    if (!cache) {
      cache = new Map();
      concreteElementMatchCaches.set(el, cache);
    }
    const cached = cache.get(transform);
    if (cached
      && cached.elementRevision === revisions.element
      && cached.stylesheetRevision === revisions.stylesheet) {
      return cached.matched;
    }
    const matched = collect(entries);
    cache.set(transform, {
      elementRevision: revisions.element,
      stylesheetRevision: revisions.stylesheet,
      matched,
    });
    return matched;
  }
  const key = `${sourceSiteKey(el, transform)}\u0000${sourceSiteContextKey(el)}`;
  let cache = sourceSiteMatchCaches.get(doc);
  if (!cache) {
    cache = new Map();
    sourceSiteMatchCaches.set(doc, cache);
  }
  const cached = cache.get(key);
  let cachedMatches: ElementMatch[];
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet) {
    cachedMatches = cached.matched;
  } else {
    cachedMatches = collect(cacheable);
    if (sourceSiteMatchCacheEntries >= SOURCE_SITE_CACHE_MAX) {
      sourceSiteMatchCaches = new WeakMap();
      sourceSiteMatchCacheEntries = 0;
      cache = new Map();
      sourceSiteMatchCaches.set(doc, cache);
    }
    if (!cache.has(key)) sourceSiteMatchCacheEntries++;
    cache.set(key, {
      elementRevision: revisions.element,
      stylesheetRevision: revisions.stylesheet,
      matched: cachedMatches,
    });
  }
  // Element-sensitive selectors are cached per concrete element rather than
  // by source-site identity. Their result can differ between siblings or
  // interactive elements, while the document revision invalidates the entry
  // after a relevant DOM or stylesheet change.
  let elementMatches: ElementMatch[] = [];
  if (elementSensitive.length > 0) {
    let cache = relationshipMatchCaches.get(el);
    if (!cache) {
      cache = new Map();
      relationshipMatchCaches.set(el, cache);
    }
    const cachedRelationship = cache.get(transform);
    if (cachedRelationship
      && cachedRelationship.elementRevision === revisions.element
      && cachedRelationship.stylesheetRevision === revisions.stylesheet) {
      elementMatches = cachedRelationship.matched;
    } else {
      elementMatches = collect(elementSensitive);
      cache.set(transform, {
        elementRevision: revisions.element,
        stylesheetRevision: revisions.stylesheet,
        matched: elementMatches,
      });
    }
  }
  return elementMatches.length === 0 ? cachedMatches : [...cachedMatches, ...elementMatches];
}

/**
 * One matching pass over the rules for the element and its ancestors, with the
 * selector-match results shared between the element's own resolution and the
 * inherited phase. Local aliases are collected per element so no ancestor
 * re-walks the lineage × rules.
 */
function resolveLineage(el: HTMLElement, rules: MatchedRule[], transform: CascadeTransform): LineageResolution {
  const lineage: HTMLElement[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    lineage.push(current);
    current = current.parentElement;
  }
  lineage.reverse();

  const selectorMatches = new Map<HTMLElement, ElementMatch[]>();
  for (const element of lineage) {
    selectorMatches.set(element, getCachedElementMatches(element, rules, transform));
  }

  const byElement = new Map<HTMLElement, ElementResolution>();
  for (let index = 0; index < lineage.length; index++) {
    const element = lineage[index]!;
    const ruleApplies = makeRuleApplies(element);
    const aliases = new Map<string, string>();
    for (const lineageElement of lineage.slice(0, index + 1)) {
      const candidates = new Map<string, LocalAliasCandidate>();
      for (const match of selectorMatches.get(lineageElement) ?? []) {
        if (!ruleApplies(match.rule)) continue;
        const sourceOrder = match.rule.sourceOrder ?? 0;
        for (const declaration of match.rule.declarations) {
          if (!declaration.property.startsWith("--") || declaration.property.startsWith("--dt-")) continue;
          const candidate: LocalAliasCandidate = {
            value: declaration.value.trim(),
            important: declaration.important,
            layer: match.rule.layer,
            specificity: match.specificity,
            sourceOrder,
          };
          const previous = candidates.get(declaration.property);
          if (!previous || compareCascade(candidate, previous) >= 0) {
            candidates.set(declaration.property, candidate);
          }
        }
      }
      for (const property of Array.from(lineageElement.style)) {
        if (!property.startsWith("--") || property.startsWith("--dt-")) continue;
        candidates.set(property, {
          value: lineageElement.style.getPropertyValue(property).trim(),
          important: lineageElement.style.getPropertyPriority(property) === "important",
          specificity: 100000000,
          sourceOrder: Number.MAX_SAFE_INTEGER,
        });
      }
      for (const [name, candidate] of candidates) aliases.set(name, candidate.value);
    }
    const matched: ElementMatch[] = [];
    for (const match of selectorMatches.get(element) ?? []) {
      if (!ruleApplies(match.rule)) continue;
      matched.push(match);
    }
    byElement.set(element, { element, matched, aliases });
  }
  return { lineage, byElement };
}

function rowsFromMatches(
  el: HTMLElement,
  matched: ElementMatch[],
  aliases: ReadonlyMap<string, string>,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const map = new Map<string, ResolvedProperty>();

  // Sort by source order ascending so rules are processed lowest-first.
  // Map.set() naturally overwrites: higher specificity rules processed later win,
  // and equal-specificity rules get "last in stylesheet order wins" (stable sort).
  const sorted = [...matched].sort((a, b) => (a.rule.sourceOrder ?? 0) - (b.rule.sourceOrder ?? 0));

  for (const m of sorted) {
    const { rule, branch, specificity } = m;
    for (const decl of rule.declarations) {
      for (const resolved of resolveDeclaration(decl, tokenTable, aliases, el)) {
        const candidate: ResolvedProperty = {
          property: resolved.property,
          tokenName: resolved.tokenName,
          declaredValue: resolved.declaredValue,
          sourceProperty: resolved.sourceProperty,
          resolvedValue: resolved.resolvedValue,
          authored: resolved.declaredValue,
          computed: "",
          tokens: resolved.tokens,
          opacity: resolved.opacity,
          modifiers: resolved.modifiers,
          capability: resolved.capability,
          resolvedTokenValue: resolved.resolvedTokenValue,
          diagnostic: resolved.diagnostic,
          structure: resolved.structure,
          atRules: rule.atRules,
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
  for (const row of rows) {
    if (row.capability !== "raw") continue;
    const value = row.authored ?? row.declaredValue ?? "";
    if (!canBecomeNumeric(value)) continue;
    const numeric = row.resolvedValue ?? row.computed ?? "";
    if (!numeric) continue;
    row.capability = capabilityFor(row.property, numeric);
  }
  return rows;
}

export function resolvePropertiesFromRules(
  el: HTMLElement,
  rules: MatchedRule[],
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const ruleApplies = makeRuleApplies(el);
  const matched: ElementMatch[] = [];
  for (const rule of rules) {
    if (rule.active === false) continue;
    if (!ruleApplies(rule)) continue;
    const match = matchRuleForElement(el, { rule, selectorText: rule.selectorText });
    if (match) matched.push(match);
  }
  const localAliases = collectLocalAliases(el, rules, ruleApplies);
  return rowsFromMatches(el, matched, localAliases, tokenTable);
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
    row.opacity = resolveColorOpacity(authored, tokenTable, EMPTY_LOCAL_ALIASES);
    row.modifiers = [{ kind: "alpha", value: alpha }];
    row.capability = "color";
    row.resolvedTokenValue = entry.value;
    row.evidence.reason = "Tailwind v4 opacity utility mapped to its base catalog token";
    row.confidence = "probable";
    return;
  }
}

// Splits CSS values at top-level combinators or an optional delimiter.
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

interface ResolvedPropertiesSnapshot {
  elementRevision: number;
  stylesheetRevision: number;
  tokenTable: TokenTable;
  rows: ResolvedProperty[];
}

const stateResolutionSnapshots = new WeakMap<HTMLElement, Map<InteractionState, ResolvedPropertiesSnapshot>>();

const INHERITED_PROPERTIES = new Set([
  "color", "font", "font-family", "font-size", "font-style", "font-variant", "font-weight",
  "letter-spacing", "line-height", "text-align", "text-indent", "text-transform", "visibility",
  "white-space", "word-spacing", "cursor",
]);

function resolveInheritedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
  lineage: LineageResolution,
  result: ResolvedProperty[],
  inaccessible: boolean,
): ResolvedProperty[] {
  const computed = getElementComputedStyle(el);
  const seenProperties = new Set(result.map((p) => p.property));
  let ancestor: HTMLElement | null = el.parentElement;
  while (ancestor) {
    const entry = lineage.byElement.get(ancestor);
    if (entry) {
      const ancestorComputed = getElementComputedStyle(ancestor);
      for (const candidate of rowsFromMatches(ancestor, entry.matched, entry.aliases, tokenTable)) {
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
  const { rules, inaccessible } = collectCssomRules(doc);
  const lineage = resolveLineage(el, rules, "live");
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable);
  const computed = getElementComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv && !/\b(?:var|calc)\s*\(/.test(cv)) {
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
        opacity: declaration.opacity,
        modifiers: declaration.modifiers,
        capability: declaration.capability,
        resolvedTokenValue: declaration.resolvedValue,
        diagnostic: undefined,
        structure: declaration.structure,
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

  // When a calc() expression only references static tokens the browser has
  // already resolved it to a pixel value.  Reclassify the row so the UI
  // shows the pixel value instead of the raw calc() string and allows
  // numeric editing (nudge / token swap).
  for (const prop of result) {
    if (prop.capability !== "raw") continue;
    const value = prop.authored ?? prop.declaredValue ?? "";
    if (!canBecomeNumeric(value)) continue;
    const numeric = prop.computed ?? prop.resolvedValue ?? "";
    if (!numeric) continue;
    prop.capability = capabilityFor(prop.property, numeric);
  }

  return resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
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
  const revisions = getDocumentRevisions(doc);
  let snapshots = stateResolutionSnapshots.get(el);
  if (!snapshots) {
    snapshots = new Map();
    stateResolutionSnapshots.set(el, snapshots);
  }
  const cached = snapshots.get(state);
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.tokenTable === tokenTable) {
    return cached.rows;
  }

  const { rules, inaccessible } = collectCssomRules(doc);
  const lineage = resolveLineage(el, rules, state);
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable);
  const computed = getElementComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv && !/\b(?:var|calc)\s*\(/.test(cv)) {
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
  const rows = resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
  registerWithAncestors(el);
  snapshots.set(state, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    tokenTable,
    rows,
  });
  return rows;
}

export function getAvailableInteractionStates(el: HTMLElement): InteractionState[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectCssomRules(doc);
  const available: InteractionState[] = ["base"];
  for (const state of INTERACTION_STATES) {
    const matched = getCachedElementMatches(el, rules, state);
    const relevant = matched.some((m) => m.rule.selectorText.includes(`:${state}`));
    if (relevant) available.push(state);
  }
  return available;
}

const stableTokenCache = new WeakMap<HTMLElement, {
  elementRevision: number;
  stylesheetRevision: number;
  tokenTable: TokenTable;
  rows: ResolvedProperty[];
}>();

/**
 * Finds the authored token-backed declaration beneath a transient interaction
 * state. This keeps an editor linked to its stable token when selection occurs
 * while the element is hovered, while getResolvedProperties remains honest
 * about the value currently painted by that transient rule. The full resolution
 * is memoized per (element, element/stylesheet revision, tokenTable) so the panel's background row
 * no longer re-runs the cascade on every render.
 */
export function getStableTokenProperty(
  el: HTMLElement,
  properties: string[],
  tokenTable: TokenTable,
): ResolvedProperty | null {
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  const cached = stableTokenCache.get(el);
  const rows = cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.tokenTable === tokenTable
    ? cached.rows
    : (() => {
      const { rules } = collectCssomRules(doc);
      const lineage = resolveLineage(el, rules, "stable");
      const entry = lineage.byElement.get(el)!;
      const fresh = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable);
      stableTokenCache.set(el, {
        elementRevision: revisions.element,
        stylesheetRevision: revisions.stylesheet,
        tokenTable,
        rows: fresh,
      });
      return fresh;
    })();
  for (const property of properties) {
    const row = rows.find((candidate) => candidate.property === property && candidate.tokenName);
    if (row) return row;
  }
  return null;
}
