import type { ResolvedProperty } from "../../css/model/index.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { hasAuthoredStyle } from "./stylePresence.ts";

const NON_TEXT_ELEMENTS = new Set(["VIDEO", "AUDIO", "IMG", "CANVAS", "IFRAME", "OBJECT", "EMBED", "SCRIPT", "STYLE"]);
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number", "submit", "reset", "button"]);
const INLINE_TEXT_ELEMENTS = new Set(["SPAN", "A", "STRONG", "EM", "B", "I", "U", "S", "SMALL", "LABEL", "CODE", "SUP", "SUB"]);
const TYPOGRAPHY_PROPERTIES = new Set([
  "font", "font-family", "font-size", "font-style", "font-weight", "line-height",
  "letter-spacing", "word-spacing", "text-align", "text-transform", "white-space",
]);

function hasTextContent(element: Element, includeBlocks: boolean): boolean {
  if (NON_TEXT_ELEMENTS.has(element.tagName)) return false;
  const style = getElementComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  if (element.tagName === "INPUT") return TEXT_INPUT_TYPES.has(element.getAttribute("type")?.toLowerCase() ?? "text");
  return Array.from(element.childNodes).some((node) => {
    if (node.nodeType === 3) return Boolean(node.textContent?.trim());
    if (node.nodeType !== 1) return false;
    // SAFETY: ELEMENT_NODE above establishes the child is an Element.
    const child = node as Element;
    const inline = INLINE_TEXT_ELEMENTS.has(child.tagName) || getElementComputedStyle(child).display.startsWith("inline");
    return (includeBlocks || inline) && hasTextContent(child, includeBlocks);
  });
}

/** Text styling is useful for text runs and containers that author descendant typography. */
export function isTextRelevant(element: HTMLElement, rows: readonly ResolvedProperty[]): boolean {
  const authorsTypography = rows.some((row) => TYPOGRAPHY_PROPERTIES.has(row.property) && hasAuthoredStyle(row));
  return hasTextContent(element, authorsTypography);
}
