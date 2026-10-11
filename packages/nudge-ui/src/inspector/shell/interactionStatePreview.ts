import { useLayoutEffect } from "react";
import { collectRules, invalidateStyleResolutionCache, subscribeDocumentRevision } from "../tokens/resolution/cssomCollector.ts";
import { selectorPseudoClasses, splitSelectorAtTopLevel } from "../tokens/resolution/selectorSemantics.ts";
import { adoptStylesheet, allowsStyleElements, releaseAdoptedStylesheet, STATE_PREVIEW_SHEET_ID } from "../runtime/ownedStylesheets.ts";
import { INTERACTION_STATES, type InteractionState } from "./styleState.ts";

const MARKER = "data-nudge-ui-state-preview";
const interactionStates = new Set<string>(INTERACTION_STATES);

/** Matches native interaction states and the Inspector's temporary CSS state. */
export function selectorForInteractionStatePreview(selector: string): string {
  let transformed = selector;
  for (const pseudo of [...selectorPseudoClasses(selector)].reverse()) {
    if (!interactionStates.has(pseudo.name)) continue;
    // Keep native states on other elements, but use the chosen state on the
    // selected element. :where() keeps the original pseudo-class specificity.
    const replacement = `:is(:${pseudo.name}:where(:not([${MARKER}])), [${MARKER}="${pseudo.name}"])`;
    transformed = transformed.slice(0, pseudo.start) + replacement + transformed.slice(pseudo.end);
  }
  return transformed;
}

function previewSelector(selector: string): string {
  const transformed = selectorForInteractionStatePreview(selector);
  // Add the same specificity to every copied branch. This preserves their
  // relative cascade while overriding native pointer states on the target.
  const scope = `:where([${MARKER}], [${MARKER}] *):is(#${STATE_PREVIEW_SHEET_ID}, *)`;
  // A scope must precede a pseudo-element, which cannot take an attribute.
  let parentheses = 0;
  let brackets = 0;
  let quote: string | null = null;
  for (let index = 0; index < transformed.length; index++) {
    const character = transformed[index];
    if (character === "\\") { index++; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "[") brackets++;
    else if (character === "]") brackets--;
    else if (brackets === 0) {
      if (character === "(") parentheses++;
      else if (character === ")") parentheses--;
      else if (parentheses === 0 && /^::|^:(?:before|after|first-line|first-letter)\b/.test(transformed.slice(index))) {
        return transformed.slice(0, index) + scope + transformed.slice(index);
      }
    }
  }
  return transformed + scope;
}

/**
 * Projects CSS interaction states into the selected element's document.
 * This previews styles without dispatching events or changing application state.
 */
export function startInteractionStatePreview(element: HTMLElement, state: InteractionState): () => void {
  if (state === "base") return () => undefined;
  const doc = element.ownerDocument;
  const previousMarker = element.getAttribute(MARKER);
  element.setAttribute(MARKER, state);
  const style = allowsStyleElements(doc) ? doc.createElement("style") : null;
  if (style) {
    style.id = STATE_PREVIEW_SHEET_ID;
    style.setAttribute("data-nudge-ui", "state-preview");
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  const refresh = (): void => {
    const css = collectRules(doc).rules.map((rule) => {
      const selector = splitSelectorAtTopLevel(rule.selectorText, ",")
        .map((branch) => previewSelector(branch.trim())).join(", ");
      const declarations = rule.declarations.map(({ property, value, important }) =>
        `${property}: ${value}${important ? " !important" : ""};`).join(" ");
      let text = `${selector} { ${declarations} }`;
      for (const wrapper of [...(rule.atRules ?? [])].reverse()) {
        text = `@${wrapper.kind} ${wrapper.params} { ${text} }`;
      }
      if (rule.layer) text = `@layer ${rule.layer} { ${text} }`;
      return text;
    }).join("\n");
    if (style) style.textContent = css;
    else adoptStylesheet(doc, STATE_PREVIEW_SHEET_ID, css);
  };

  refresh();
  // Inspection excludes the preview sheet, but its painted values have changed.
  invalidateStyleResolutionCache(doc);
  const unsubscribe = subscribeDocumentRevision(doc, refresh);
  return () => {
    unsubscribe();
    style?.remove();
    releaseAdoptedStylesheet(doc, STATE_PREVIEW_SHEET_ID);
    if (previousMarker === null) element.removeAttribute(MARKER);
    else element.setAttribute(MARKER, previousMarker);
    invalidateStyleResolutionCache(doc);
  };
}

export function useInteractionStatePreview(element: HTMLElement | null, state: InteractionState): void {
  useLayoutEffect(() => element ? startInteractionStatePreview(element, state) : undefined, [element, state]);
}
