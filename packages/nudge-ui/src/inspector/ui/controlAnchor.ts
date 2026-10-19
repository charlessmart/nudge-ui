import type { RefObject } from "react";

/** Popups line up with the visible control box, not the trigger or input inside it. */
export function controlAnchor(ref: RefObject<Element | null>, fallback: (element: Element) => Element | null = (element) => element): () => Element | null {
  return () => {
    const element = ref.current;
    if (!element) return null;
    return element.closest(".control-surface") ?? fallback(element);
  };
}
