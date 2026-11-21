/**
 * Normalizes a token's value to its computed form without touching the page.
 * A probe inserted into the page restyles everything a `:has()` selector reaches, which is the whole document on many production sites.
 */
import { getElementComputedStyle } from "../../runtime/domRealm.ts";

const probeRoots = new WeakMap<Document, ShadowRoot>();
const probes = new WeakMap<ShadowRoot, HTMLElement>();

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const HEX_COLOR = /^#[\da-f]{3,8}$/i;
const COLOR_FUNCTION = new RegExp(String.raw`^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?:\s*(?:${NUMBER}(?:%|deg)?|none|[,/]))+\s*\)$`, "i");
/** Lengths that resolve against the document alone; `em`, `%` and the rest depend on the element. */
const ABSOLUTE_NUMBER = new RegExp(`^${NUMBER}(?:px|rem)?$`, "i");
const SINGLE_VARIABLE = /^var\(\s*(--[\w-]+)\s*\)$/;
/** These compute against the element's own font size or border style, so only a probe in the page answers for them. */
const ELEMENT_DEPENDENT_PROPERTY = /^(?:line-height$|(?:border|outline|column-rule)(?!.*(?:color|radius)$))/;

/** Splits on whitespace and commas outside parentheses. */
function topLevelParts(value: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth < 0) return null;
    if (index === value.length || (depth === 0 && (char === "," || char === " " || char === "\t" || char === "\n"))) {
      if (index > start) parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  return depth === 0 ? parts : null;
}

/** Keywords that mean one thing wherever they are used; `auto`, `inherit` and system colors do not. */
const FIXED_KEYWORD = /^(?:none|transparent|white|black|inset)$/i;
const FONT_FAMILY_LIST = /^[\w\s"',-]+$/;
const FONT_WEIGHT_KEYWORD = /^(?:normal|bold)$/i;

/** Whether a value computes the same on any element of one document: literal colors, document-relative lengths and fixed keywords only. */
export function isContextFreeValue(property: string, value: string): boolean {
  if (value.length === 0 || value.length > 240) return false;
  if (property === "font-family") return FONT_FAMILY_LIST.test(value);
  if (property === "font-weight" && FONT_WEIGHT_KEYWORD.test(value)) return true;
  const parts = topLevelParts(value);
  return parts !== null && parts.length > 0
    && parts.every((part) => HEX_COLOR.test(part) || ABSOLUTE_NUMBER.test(part) || COLOR_FUNCTION.test(part) || FIXED_KEYWORD.test(part));
}

/** Not inherited, with an initial value that no layout or tag decides: an undefined token leaves these at that initial value. */
const FIXED_INITIAL_PROPERTY = /^(?:(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|(?:row-|column-)?gap|border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|opacity|z-index|box-shadow|background-color|background-image)$/;

/** Lends a shadow root the page's selectors cannot reach; the inspector's own mount is one. */
export function registerPaintedValueProbeRoot(doc: Document, root: ShadowRoot): () => void {
  probeRoots.set(doc, root);
  return () => {
    probes.get(root)?.remove();
    probes.delete(root);
    if (probeRoots.get(doc) === root) probeRoots.delete(doc);
  };
}

function probeFor(root: ShadowRoot): HTMLElement {
  const existing = probes.get(root);
  if (existing?.isConnected) return existing;
  const probe = root.ownerDocument.createElement("div");
  probe.setAttribute("data-nudge-ui", "attribution-probe");
  // A transition would report the value it starts from.
  probe.style.cssText = "display: none !important; transition: none !important; animation: none !important;";
  root.appendChild(probe);
  probes.set(root, probe);
  return probe;
}

const UNREGISTERED_SENTINEL = "nudge-ui-unregistered";

/** A custom property registered with a syntax computes to a normalized value instead of the text it was given. */
function isTypedCustomProperty(probe: HTMLElement, property: string): boolean {
  probe.style.setProperty(property, UNREGISTERED_SENTINEL);
  const computed = getElementComputedStyle(probe).getPropertyValue(property).trim();
  probe.style.removeProperty(property);
  return computed !== UNREGISTERED_SENTINEL;
}

/**
 * The computed form of `property: var(--token)` beside `el`, or null when only a probe in the page can answer.
 * A sibling probe inherits the token from the parent, so the parent's computed token is the value it would substitute.
 */
export function contextFreePaintedValue(el: HTMLElement, property: string, declaredValue: string): string | null {
  const doc = el.ownerDocument;
  const root = probeRoots.get(doc);
  if (!root || ELEMENT_DEPENDENT_PROPERTY.test(property)) return null;
  const name = SINGLE_VARIABLE.exec(declaredValue)?.[1];
  const context = el.parentElement ?? doc.body;
  if (!name || !context) return null;
  const contextStyle = getElementComputedStyle(context);
  const tokenValue = contextStyle.getPropertyValue(name).trim();
  const probe = probeFor(root);
  if (property.startsWith("--")) {
    // An untyped custom property computes to the substituted text itself, and an undefined token leaves it inheriting.
    if (isTypedCustomProperty(probe, property)) return null;
    return tokenValue || contextStyle.getPropertyValue(property).trim();
  }
  // A token the parent does not define is invalid on a sibling, however the element itself defines it.
  const value = tokenValue || (FIXED_INITIAL_PROPERTY.test(property) ? "initial" : "");
  if (value !== "initial" && !isContextFreeValue(property, value)) return null;
  probe.style.setProperty(property, value, "important");
  const normalized = getElementComputedStyle(probe).getPropertyValue(property).trim();
  probe.style.removeProperty(property);
  return normalized;
}
