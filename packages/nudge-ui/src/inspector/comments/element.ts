import type { RenderedInstanceRef } from "../changes/editModel.ts";
import { resolveRenderedInstance } from "../projection/renderedInstance.ts";
import { sourceSiteSelector } from "../selection/sourceSite.ts";

/** Retains a changed target only when its source site still identifies one output. */
export function resolveCommentElement(doc: Document, target: RenderedInstanceRef): HTMLElement | null {
  const exact = resolveRenderedInstance(doc, target);
  if (exact.status === "resolved") return exact.element;
  const selector = sourceSiteSelector(target.sourceSite.cid, target.sourceSite.src);
  if (!selector) return null;
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  if (candidates.length === 1) return candidates[0]!;
  const { props, ariaLabel } = target.locator;
  if (!props && !ariaLabel) return null;
  const matching = candidates.filter((element) => element.getAttribute("data-cprops") === props
    && element.getAttribute("aria-label") === (ariaLabel ?? null));
  return matching.length === 1 ? matching[0]! : null;
}

export function commentViewport(doc: Document): string {
  return `${doc.defaultView?.innerWidth}:${doc.defaultView?.innerHeight}`;
}

/** Captures rendered content and appearance, excluding inspector identity and transient cursors. */
export function commentFingerprint(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...clone.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith("data-nudge") || attribute.name.startsWith("data-projection")
        || ["data-cid", "data-src", "data-cprops", "data-renderer-id"].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
    if (node instanceof element.ownerDocument.defaultView!.HTMLElement) {
      node.style.removeProperty("cursor");
      if (node.getAttribute("style") === "") node.removeAttribute("style");
    }
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const properties = ["color", "background-color", "font-family", "font-size", "font-weight", "line-height",
    "padding", "margin", "gap", "display", "border", "border-radius", "box-shadow", "opacity", "width", "height"];
  const value = JSON.stringify([clone.outerHTML, properties.map((property) => style?.getPropertyValue(property) ?? "")]);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
