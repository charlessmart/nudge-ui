import { adoptStylesheet, allowsStyleElements, releaseAdoptedStylesheet, VALUE_PREVIEW_SHEET_ID } from "../runtime/ownedStylesheets.ts";

const MARKER = "data-nudge-ui-value-preview";
// Matching the sheet's own ID lends the rule ID specificity without excluding any element.
const SELECTOR = `[${MARKER}]:is(#${VALUE_PREVIEW_SHEET_ID}, *)`;

let stopActive: (() => void) | null = null;

/**
 * Paints one declaration on the elements until it is stopped, for a value the
 * user is considering. Inline styles stay untouched, and inspection ignores
 * both the marker attribute and the sheet, so fields keep their authored values.
 * Starting a preview stops the previous one; only the returned function, and
 * only while its preview is active, stops a preview.
 */
export function startValuePreview(elements: readonly HTMLElement[], property: string, value: string): () => void {
  stopActive?.();
  const cleanups = Array.from(new Set(elements.map((element) => element.ownerDocument)), (doc) => paint(doc, property, value));
  for (const element of elements) element.setAttribute(MARKER, "");
  const stop = (): void => {
    if (stopActive !== stop) return;
    stopActive = null;
    for (const element of elements) element.removeAttribute(MARKER);
    for (const cleanup of cleanups) cleanup();
  };
  stopActive = stop;
  return stop;
}

function paint(doc: Document, property: string, value: string): () => void {
  const css = `${SELECTOR} {}`;
  if (allowsStyleElements(doc)) {
    const style = doc.createElement("style");
    style.id = VALUE_PREVIEW_SHEET_ID;
    style.setAttribute("data-nudge-ui", "value-preview");
    style.textContent = css;
    (doc.head ?? doc.documentElement).appendChild(style);
    declare(style.sheet, property, value);
    return () => style.remove();
  }
  declare(adoptStylesheet(doc, VALUE_PREVIEW_SHEET_ID, css), property, value);
  return () => releaseAdoptedStylesheet(doc, VALUE_PREVIEW_SHEET_ID);
}

// The CSSOM keeps an arbitrary value inside its declaration.
function declare(sheet: CSSStyleSheet | null, property: string, value: string): void {
  // SAFETY: the sheet holds only the style rule written above; frames have their own CSSStyleRule, so instanceof cannot check it.
  const rule = sheet?.cssRules[0] as CSSStyleRule | undefined;
  rule?.style.setProperty(property, value, "important");
}
