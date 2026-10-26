import type { ColorValueFacts, EditCapability, TokenEntry } from "../model/index.ts";
import { interpretColorValue } from "./colorSemantics.ts";
import { isSingleVarReference } from "./cssSyntax.ts";

declare global {
  interface Window {
    CSS?: {
      supports(conditionText: string): boolean;
      supports(property: string, value: string): boolean;
    };
  }
}

export type TokenSemanticSlot =
  | "color"
  | "length"
  | "radius"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "letter-spacing"
  | "shadow"
  | "opacity";

export type TokenGroup = "color" | "spacing" | "radius" | "typography" | "shadow" | "generic";

export const TOKEN_GROUP_LABELS = {
  color: "Color",
  spacing: "Spacing",
  radius: "Radius",
  typography: "Typography",
  shadow: "Shadow",
  generic: "Other",
};

export const TOKEN_GROUP_ORDER: TokenGroup[] = [
  "color",
  "spacing",
  "radius",
  "typography",
  "shadow",
  "generic",
];

export interface CssValueGrammar {
  supports(property: string, value: string): boolean;
}

export interface TokenPresentation {
  group: TokenGroup;
  label: string;
}

export interface TokenCandidate {
  entry: TokenEntry;
  resolvedValue: string;
  color?: ColorValueFacts;
  presentation: TokenPresentation;
  group: TokenGroup;
  isCurrent: boolean;
}

export interface TokenCompatibilityRequest {
  /** Resolves custom properties in this element's cascade. */
  element?: HTMLElement;
  property: string;
  /** A scalar slot inside a composite property, such as the color in a shadow. */
  slot?: TokenSemanticSlot;
  entries: readonly TokenEntry[];
  currentToken?: string | null;
  grammar?: CssValueGrammar;
}

export interface TokenSelectionRequest {
  /** Omit for presentation-only inventory grouping without eligibility filtering. */
  property?: string;
  slot?: TokenSemanticSlot;
  entries: readonly TokenEntry[];
  currentToken?: string | null;
  element?: HTMLElement;
  grammar?: CssValueGrammar;
}

export interface TokenSelection {
  candidates: TokenCandidate[];
  preferredGroup: TokenGroup;
}

const COLOR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "caret-color",
  "column-rule-color",
  "text-decoration-color",
  "text-emphasis-color",
]);

const LENGTH_PROPERTIES = new Set([
  "padding",
  "margin",
  "gap",
  "row-gap",
  "column-gap",
  "border-spacing",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-block",
  "inset-inline",
]);

const SLOT_PROPERTIES = {
  color: "color",
  length: "margin",
  radius: "border-radius",
  "font-family": "font-family",
  "font-size": "font-size",
  "font-weight": "font-weight",
  "line-height": "line-height",
  "letter-spacing": "letter-spacing",
  shadow: "box-shadow",
  opacity: "opacity",
};

function normaliseProperty(property: string): string {
  return property.trim().toLowerCase();
}

/** Property knowledge lives here rather than in every picker: a presentation preference and validation slot, never a name-based filter. */
export function semanticSlotForProperty(property: string): TokenSemanticSlot | null {
  const normalized = normaliseProperty(property);
  if (COLOR_PROPERTIES.has(normalized) || /(^|-)color$/.test(normalized)) return "color";
  if (normalized === "box-shadow") return "shadow";
  if (normalized === "opacity") return "opacity";
  if (normalized === "border-radius" || normalized.endsWith("-radius")) return "radius";
  if (normalized === "font-family") return "font-family";
  if (normalized === "font-size") return "font-size";
  if (normalized === "font-weight") return "font-weight";
  if (normalized === "line-height") return "line-height";
  if (normalized === "letter-spacing") return "letter-spacing";
  if (
    LENGTH_PROPERTIES.has(normalized)
    || /^(?:padding|margin|inset)-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end|horizontal|vertical)$/.test(normalized)
    || (normalized.startsWith("border-") && normalized.endsWith("-width"))
  ) return "length";
  return null;
}

export function groupForProperty(property: string, slot?: TokenSemanticSlot): TokenGroup {
  const semanticSlot = slot ?? semanticSlotForProperty(property);
  if (semanticSlot === "color") return "color";
  if (semanticSlot === "length") return "spacing";
  if (semanticSlot === "radius") return "radius";
  if (semanticSlot === "shadow") return "shadow";
  if (semanticSlot?.startsWith("font") || semanticSlot === "line-height" || semanticSlot === "letter-spacing") {
    return "typography";
  }
  return "generic";
}

/** Precedence is load-bearing and must match the resolver's. */
export function classifyEditCapability(property: string, value: string): EditCapability {
  const p = property.toLowerCase();
  const v = value.trim().toLowerCase();
  // A numeric side control cannot represent these functions faithfully, so the authored expression stays raw even on a spacing property.
  if (/\b(?:min|max|clamp|env|anchor-size)\s*\(/.test(v)) return "raw";
  if (["margin", "padding", "inset", "inset-block", "inset-inline"].includes(p)
    || p.startsWith("margin-") || p.startsWith("padding-") || p.startsWith("inset-")) return "box-sides";
  if (p === "border" || p.endsWith("-border") || p === "border-color" || p.endsWith("-border-color")) return "structured";
  if (p === "color" || /(^|-)color$/.test(p) || p === "background-color" || p === "fill" || p === "stroke") return "color";
  if (isSingleVarReference(v)) return "atomic";
  if (p === "font" || /(gradient|shadow|transform|transition|animation|grid|background)/.test(p)
    || (v.includes(",") && !isSingleVarReference(v))) return "composite";
  if (/\b(min|max|clamp|color-mix)\s*\(/.test(v)) return "raw";
  if (/^[+-]?(?:\d*\.)?\d+(?:[a-z%]+)?$/i.test(v)
    || /^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|transparent|currentcolor)/.test(v)) return "atomic";
  return "raw";
}

/** Presentation hint only; a name never makes an invalid value eligible for a slot. */
export function classifyToken(name: string, value = ""): TokenGroup {
  if (name.startsWith("--color-")) return "color";
  if (name.startsWith("--space-")) return "spacing";
  if (name.startsWith("--radius-")) return "radius";
  if (name.startsWith("--font-") || name.startsWith("--text-") || name.startsWith("--type-")
    || name.startsWith("--leading-") || name.startsWith("--tracking-")) return "typography";
  const humanPath = name.toLowerCase();
  if (/(^|\.)(color|colors|surface|background|foreground)(\.|$)/.test(humanPath) || /^(?:#|rgb\(|hsl\(|oklch\(|oklab\(|transparent)/i.test(value.trim())) return "color";
  if (/(^|\.)(space|spacing|size|gap)(\.|$)/.test(humanPath)) return "spacing";
  if (/(^|\.)(font|typography|lineheight|letterspacing)(\.|$)/.test(humanPath)) return "typography";
  return "generic";
}

function tokenVariableName(entry: TokenEntry): string {
  return entry.cssName ?? entry.name;
}

function hasUnresolvedVariable(value: string): boolean {
  return /\bvar\s*\(/i.test(value);
}

/** Hoisted so one request resolves each token against a single computed style. */
function elementStyle(element?: HTMLElement): CSSStyleDeclaration | null {
  const view = element?.ownerDocument.defaultView;
  return element && view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(element) : null;
}

function resolveValueInElement(entry: TokenEntry, style: CSSStyleDeclaration | null): string {
  const variableName = tokenVariableName(entry);
  if (style && variableName.startsWith("--")) {
    const computed = style.getPropertyValue(variableName).trim();
    if (computed) return computed;
  }
  return entry.value.trim();
}

function browserCss(element?: HTMLElement): CssSupports | undefined {
  const elementCss = element?.ownerDocument.defaultView?.CSS;
  if (elementCss) return elementCss;
  return globalThis.CSS;
}

function isLength(value: string): boolean {
  return /^(?:0|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]+)|(?:calc|min|max|clamp)\()/i.test(value.trim());
}

function isColor(value: string): boolean {
  return /^(?:#(?:[\da-f]{3,8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|transparent|currentcolor)$/i.test(value.trim());
}

function isOpacity(value: string): boolean {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:%)?$/.test(value.trim());
}

/** Conservative fallback for non-browser environments that lack CSS.supports. */
function fallbackSupports(property: string, value: string): boolean {
  const normalized = normaliseProperty(property);
  if (COLOR_PROPERTIES.has(normalized) || /(^|-)color$/.test(normalized)) return isColor(value);
  if (normalized === "border-radius") return isLength(value);
  if (normalized === "opacity") return isOpacity(value);
  if (normalized === "box-shadow") return /(?:\d(?:px|rem|em)|\bnone\b)/i.test(value);
  if (normalized === "font-size" || normalized === "line-height" || normalized === "letter-spacing") return isLength(value);
  if (normalized === "font-weight") return /^(?:normal|bold|[1-9]00)$/i.test(value.trim());
  if (normalized === "font-family") return Boolean(value.trim()) && !isColor(value) && !isLength(value);
  if (LENGTH_PROPERTIES.has(normalized) || normalized.startsWith("padding-") || normalized.startsWith("margin-")) return isLength(value);
  return false;
}

type CssSupports = { supports?(property: string, value: string): boolean };

const SUPPORTS_CACHE_LIMIT = 20_000;
const supportsCaches = new WeakMap<CssSupports, Map<string, boolean>>();

/** Cached per CSS object: pickers repeat the same questions for every field on every selection. */
function cachedSupports(css: CssSupports, property: string, value: string): boolean | null {
  if (typeof css.supports !== "function") return null;
  let cache = supportsCaches.get(css);
  if (!cache) {
    cache = new Map();
    supportsCaches.set(css, cache);
  }
  const key = `${property}\n${value}`;
  let supported = cache.get(key);
  if (supported === undefined) {
    if (cache.size >= SUPPORTS_CACHE_LIMIT) cache.clear();
    supported = css.supports(property, value);
    cache.set(key, supported);
  }
  return supported;
}

export function browserCssGrammar(element?: HTMLElement): CssValueGrammar {
  const css = browserCss(element);
  return {
    supports(property, value) {
      if (hasUnresolvedVariable(value) || !value.trim()) return false;
      return (css ? cachedSupports(css, property, value) : null) ?? fallbackSupports(property, value);
    },
  };
}

function nameHint(name: string): TokenGroup | null {
  const normalized = name.toLowerCase();
  if (/(?:^|[._-])(?:color|surface|background|foreground|content)(?:[._-]|$)/.test(normalized)) return "color";
  if (/(?:^|[._-])(?:radius|rounded)(?:[._-]|$)/.test(normalized)) return "radius";
  if (/(?:^|[._-])(?:font|text|type|typography|leading|tracking|line-height|letter-spacing)(?:[._-]|$)/.test(normalized)) return "typography";
  if (/(?:^|[._-])shadow(?:[._-]|$)/.test(normalized)) return "shadow";
  if (/(?:^|[._-])(?:space|spacing|gap|size)(?:[._-]|$)/.test(normalized)) return "spacing";
  return null;
}

export function presentationForToken(entry: TokenEntry, grammar: CssValueGrammar = browserCssGrammar()): TokenPresentation {
  const value = entry.value.trim();
  const group = !hasUnresolvedVariable(value) && grammar.supports("color", value)
    ? "color"
    : nameHint(entry.name)
      ?? (!hasUnresolvedVariable(value) && grammar.supports("box-shadow", value) ? "shadow" : null)
      ?? (!hasUnresolvedVariable(value) && grammar.supports("margin", value) ? "spacing" : "generic");
  return { group, label: TOKEN_GROUP_LABELS[group] };
}

function isCurrentToken(entry: TokenEntry, currentToken: string | null | undefined): boolean {
  return Boolean(currentToken) && (entry.name === currentToken || entry.cssName === currentToken);
}

function validationProperty(property: string, slot?: TokenSemanticSlot): string {
  return slot ? SLOT_PROPERTIES[slot] : property;
}

function compareCandidates(preferred: TokenGroup) {
  return (left: TokenCandidate, right: TokenCandidate): number => {
    if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
    const leftPreferred = left.group === preferred;
    const rightPreferred = right.group === preferred;
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    return left.entry.name.localeCompare(right.entry.name);
  };
}

/** The single candidate-selection seam; presentation labels only rank results. */
export function getCompatibleTokenCandidates(request: TokenCompatibilityRequest): TokenCandidate[] {
  const grammar = request.grammar ?? browserCssGrammar(request.element);
  const slot = request.slot ?? semanticSlotForProperty(request.property) ?? undefined;
  const property = validationProperty(request.property, slot);
  const preferredGroup = groupForProperty(request.property, slot);
  const style = elementStyle(request.element);
  return request.entries
    .map((entry): TokenCandidate => {
      const resolvedValue = resolveValueInElement(entry, style);
      const presentation = presentationForToken({ ...entry, value: resolvedValue }, grammar);
      return {
        entry,
        resolvedValue,
        presentation,
        group: presentation.group,
        isCurrent: isCurrentToken(entry, request.currentToken),
      };
    })
    .filter((candidate) => candidate.isCurrent || (!hasUnresolvedVariable(candidate.resolvedValue)
      && grammar.supports(property, candidate.resolvedValue)))
    .sort(compareCandidates(preferredGroup));
}

/** Without a property, returns presentation metadata only — never invents eligibility. */
export function selectTokens(request: TokenSelectionRequest): TokenSelection {
  if (request.property) {
    const slot = request.slot ?? semanticSlotForProperty(request.property) ?? undefined;
    return {
      candidates: getCompatibleTokenCandidates({
        property: request.property,
        entries: request.entries,
        ...(request.element ? { element: request.element } : {}),
        ...(slot ? { slot } : {}),
        ...(request.currentToken !== undefined ? { currentToken: request.currentToken } : {}),
        ...(request.grammar ? { grammar: request.grammar } : {}),
      }),
      preferredGroup: groupForProperty(request.property, slot),
    };
  }

  const grammar = request.grammar ?? browserCssGrammar(request.element);
  const style = elementStyle(request.element);
  return {
    candidates: request.entries.map((entry) => {
      const resolvedValue = resolveValueInElement(entry, style);
      const presentation = presentationForToken({ ...entry, value: resolvedValue }, grammar);
      return {
        entry,
        resolvedValue,
        color: interpretColorValue(resolvedValue, { tokenTable: {} }).facts,
        presentation,
        group: presentation.group,
        isCurrent: isCurrentToken(entry, request.currentToken),
      };
    }),
    preferredGroup: "generic",
  };
}
