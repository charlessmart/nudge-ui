import type { TokenEntry } from "virtual:design-tokens";
import { getElementComputedStyle } from "../domRealm.ts";

/**
 * The presentation category is intentionally separate from eligibility. A
 * category may make a long picker easier to scan, but only CSS grammar decides
 * whether a token can replace a value.
 */
export type TokenGroup = "color" | "spacing" | "radius" | "typography" | "shadow" | "generic";

export type TokenSemanticSlot =
  | "color"
  | "length"
  | "radius"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "letter-spacing"
  | "shadow";

export const TOKEN_GROUP_LABELS: Record<TokenGroup, string> = {
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

/** Browser grammar is injectable so the compatibility module stays unit-testable. */
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
  presentation: TokenPresentation;
  group: TokenGroup;
  isCurrent: boolean;
}

export interface TokenCompatibilityRequest {
  /** The selected host element, used to resolve custom properties in its cascade. */
  element?: HTMLElement;
  /** The outer CSS property being edited. */
  property: string;
  /** A scalar slot inside a composite property, such as the color in a shadow. */
  slot?: TokenSemanticSlot;
  entries: readonly TokenEntry[];
  currentToken?: string | null;
  grammar?: CssValueGrammar;
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

const SLOT_PROPERTIES: Record<TokenSemanticSlot, string> = {
  color: "color",
  length: "margin",
  radius: "border-radius",
  "font-family": "font-family",
  "font-size": "font-size",
  "font-weight": "font-weight",
  "line-height": "line-height",
  "letter-spacing": "letter-spacing",
  shadow: "box-shadow",
};

function normaliseProperty(property: string): string {
  return property.trim().toLowerCase();
}

/**
 * Property knowledge lives here rather than in every picker. It supplies a
 * presentation preference and validation slot; it never filters a candidate
 * merely because of that candidate's name.
 */
export function semanticSlotForProperty(property: string): TokenSemanticSlot | null {
  const normalized = normaliseProperty(property);
  if (COLOR_PROPERTIES.has(normalized) || /(^|-)color$/.test(normalized)) return "color";
  if (normalized === "box-shadow") return "shadow";
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

function tokenVariableName(entry: TokenEntry): string {
  return entry.cssName ?? entry.name;
}

function hasUnresolvedVariable(value: string): boolean {
  return /\bvar\s*\(/i.test(value);
}

function resolveValueInElement(entry: TokenEntry, element?: HTMLElement): string {
  const variableName = tokenVariableName(entry);
  if (element && variableName.startsWith("--")) {
    const computed = getElementComputedStyle(element).getPropertyValue(variableName).trim();
    if (computed) return computed;
  }
  return entry.value.trim();
}

function browserCss(element?: HTMLElement): { supports?(property: string, value: string): boolean } | undefined {
  const elementCss = element?.ownerDocument.defaultView as (Window & {
    CSS?: { supports?(property: string, value: string): boolean };
  }) | null | undefined;
  if (elementCss?.CSS) return elementCss.CSS;
  return (globalThis as { CSS?: { supports?(property: string, value: string): boolean } }).CSS;
}

function isLength(value: string): boolean {
  return /^(?:0|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]+)|(?:calc|min|max|clamp)\()/i.test(value.trim());
}

function isColor(value: string): boolean {
  return /^(?:#(?:[\da-f]{3,8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|transparent|currentcolor)$/i.test(value.trim());
}

/**
 * Modern browsers provide CSS.supports. The small fallback keeps non-browser
 * unit environments conservative and never treats a var() expression as a
 * resolved value.
 */
function fallbackSupports(property: string, value: string): boolean {
  const normalized = normaliseProperty(property);
  if (COLOR_PROPERTIES.has(normalized) || /(^|-)color$/.test(normalized)) return isColor(value);
  if (normalized === "border-radius") return isLength(value);
  if (normalized === "box-shadow") return /(?:\d(?:px|rem|em)|\bnone\b)/i.test(value);
  if (normalized === "font-size" || normalized === "line-height" || normalized === "letter-spacing") return isLength(value);
  if (normalized === "font-weight") return /^(?:normal|bold|[1-9]00)$/i.test(value.trim());
  if (normalized === "font-family") return Boolean(value.trim()) && !isColor(value) && !isLength(value);
  if (LENGTH_PROPERTIES.has(normalized) || normalized.startsWith("padding-") || normalized.startsWith("margin-")) return isLength(value);
  return false;
}

export function browserCssGrammar(element?: HTMLElement): CssValueGrammar {
  const css = browserCss(element);
  return {
    supports(property, value) {
      if (hasUnresolvedVariable(value) || !value.trim()) return false;
      if (typeof css?.supports === "function") return css.supports(property, value);
      return fallbackSupports(property, value);
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

/**
 * Presentation may use a name to make familiar token sets easier to scan, but
 * a name never grants eligibility. Unfamiliar concrete colors still group as
 * Color via the same CSS grammar used by the candidate selector.
 */
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

/**
 * The single candidate-selection seam for every token-editing control.
 * Concrete values are checked in the selected element's cascade, then the
 * browser grammar decides eligibility. Presentation labels only rank results.
 */
export function getCompatibleTokenCandidates(request: TokenCompatibilityRequest): TokenCandidate[] {
  const grammar = request.grammar ?? browserCssGrammar(request.element);
  const slot = request.slot ?? semanticSlotForProperty(request.property) ?? undefined;
  const property = validationProperty(request.property, slot);
  const preferredGroup = groupForProperty(request.property, slot);
  return request.entries
    .map((entry): TokenCandidate => {
      const resolvedValue = resolveValueInElement(entry, request.element);
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
