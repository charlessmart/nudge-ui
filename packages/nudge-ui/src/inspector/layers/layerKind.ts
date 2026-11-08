import { getElementComputedStyle } from "../runtime/domRealm.ts";

export type LayerKind =
  | "flex-row"
  | "flex-column"
  | "grid"
  | "text"
  | "image"
  | "vector"
  | "input"
  | "button"
  | "link"
  | "box";

const IMAGE_TAGS = new Set(["img", "picture", "video", "canvas", "iframe"]);
const INPUT_TAGS = new Set(["input", "textarea", "select"]);

function isInline(element: Element): boolean {
  // An unstyled document can report no display at all for inline elements.
  const display = getElementComputedStyle(element).display;
  return display === "inline" || display === "";
}

/** Text, or text run through inline elements (`<em>`, `<span>`, `<br>`), with nothing laid out as a box. */
function isTextLeaf(element: Element): boolean {
  if ((element.textContent ?? "").trim() === "") return false;
  return [...element.children].every((child) => isInline(child) && isTextLeafOrEmpty(child));
}

function isTextLeafOrEmpty(element: Element): boolean {
  return element.children.length === 0 || isTextLeaf(element);
}

/** What a layer is, for its icon: its layout when it lays out children, else what it shows. */
export function layerKind(element: Element): LayerKind {
  const tag = element.localName;
  if (tag === "svg") return "vector";
  if (IMAGE_TAGS.has(tag)) return "image";
  if (INPUT_TAGS.has(tag)) return "input";
  const style = getElementComputedStyle(element);
  const display = style.display;
  if (display === "flex" || display === "inline-flex") {
    return style.flexDirection.startsWith("column") ? "flex-column" : "flex-row";
  }
  if (display === "grid" || display === "inline-grid") return "grid";
  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (isTextLeaf(element)) return "text";
  return "box";
}
