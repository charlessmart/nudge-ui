import type { StringListRecord } from "./stringRecord.ts";
import { isLayoutPreview } from "./layoutPreviewState.ts";

// A `style`-attribute shorthand authors the keyed longhand; managed previews lose the cascade to inline styles.
const SHORTHAND_SOURCES: StringListRecord = {
  "font-family": ["font"],
  "font-style": ["font"],
  "font-weight": ["font"],
  "font-size": ["font"],
  "line-height": ["font"],
  "background-color": ["background"],
  "background-image": ["background"],
  "row-gap": ["gap"],
  "column-gap": ["gap"],
  "flex-grow": ["flex"],
  "flex-shrink": ["flex"],
  "flex-basis": ["flex"],
  "flex-direction": ["flex-flow"],
  "flex-wrap": ["flex-flow"],
  "align-content": ["place-content"],
  "justify-content": ["place-content"],
  "align-items": ["place-items"],
  "justify-items": ["place-items"],
  "align-self": ["place-self"],
  "justify-self": ["place-self"],
  "border-width": ["border"],
  "border-style": ["border"],
  "border-color": ["border"],
  "border-top-left-radius": ["border-radius"],
  "border-top-right-radius": ["border-radius"],
  "border-bottom-right-radius": ["border-radius"],
  "border-bottom-left-radius": ["border-radius"],
  "border-top-width": ["border-top", "border-width", "border"],
  "border-right-width": ["border-right", "border-width", "border"],
  "border-bottom-width": ["border-bottom", "border-width", "border"],
  "border-left-width": ["border-left", "border-width", "border"],
  "border-top-style": ["border-top", "border-style", "border"],
  "border-right-style": ["border-right", "border-style", "border"],
  "border-bottom-style": ["border-bottom", "border-style", "border"],
  "border-left-style": ["border-left", "border-style", "border"],
  "border-top-color": ["border-top", "border-color", "border"],
  "border-right-color": ["border-right", "border-color", "border"],
  "border-bottom-color": ["border-bottom", "border-color", "border"],
  "border-left-color": ["border-left", "border-color", "border"],
  "margin-top": ["margin", "margin-block", "margin-block-start", "margin-block-end"],
  "margin-right": ["margin", "margin-inline", "margin-inline-start", "margin-inline-end"],
  "margin-bottom": ["margin", "margin-block", "margin-block-start", "margin-block-end"],
  "margin-left": ["margin", "margin-inline", "margin-inline-start", "margin-inline-end"],
  "padding-top": ["padding", "padding-block", "padding-block-start", "padding-block-end"],
  "padding-right": ["padding", "padding-inline", "padding-inline-start", "padding-inline-end"],
  "padding-bottom": ["padding", "padding-block", "padding-block-start", "padding-block-end"],
  "padding-left": ["padding", "padding-inline", "padding-inline-start", "padding-inline-end"],
  top: ["inset", "inset-block", "inset-block-start", "inset-block-end"],
  right: ["inset", "inset-inline", "inset-inline-start", "inset-inline-end"],
  bottom: ["inset", "inset-block", "inset-block-start", "inset-block-end"],
  left: ["inset", "inset-inline", "inset-inline-start", "inset-inline-end"],
  "grid-template-columns": ["grid-template", "grid"],
  "grid-template-rows": ["grid-template", "grid"],
  "grid-template-areas": ["grid-template", "grid"],
  "grid-auto-columns": ["grid-auto", "grid"],
  "grid-auto-rows": ["grid-auto", "grid"],
  "grid-auto-flow": ["grid-auto", "grid"],
  "grid-row": ["grid-area", "grid"],
  "grid-column": ["grid-area", "grid"],
  "grid-row-start": ["grid-row", "grid-area", "grid"],
  "grid-row-end": ["grid-row", "grid-area", "grid"],
  "grid-column-start": ["grid-column", "grid-area", "grid"],
  "grid-column-end": ["grid-column", "grid-area", "grid"],
};

// Blocked when any longhand is inline-authored, even if the shorthand itself is not.
const LINKED_LONGHANDS: StringListRecord = {
  "border-width": ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"],
  "border-style": ["border-top-style", "border-right-style", "border-bottom-style", "border-left-style"],
  "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
  "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
};

/** Non-null means the field must present as blocked: previews cannot beat inline styles in the cascade. */
export function inlineAuthoredValue(el: HTMLElement, property: string): string | null {
  if (isLayoutPreview(el, property)) return null;
  for (const source of [property, ...(SHORTHAND_SOURCES[property] ?? [])]) {
    const value = el.style.getPropertyValue(source).trim();
    if (value) return `${source}: ${value}`;
  }
  for (const longhand of LINKED_LONGHANDS[property] ?? []) {
    const value = inlineAuthoredValue(el, longhand);
    if (value) return value;
  }
  return null;
}

export function inlineBlockedBy(elements: readonly HTMLElement[], ...properties: readonly string[]): string | null {
  for (const property of properties) {
    for (const el of elements) {
      const value = inlineAuthoredValue(el, property);
      if (value) return value;
    }
  }
  return null;
}
