import type { ResolvedProperty, TokenEntry, TokenTable } from "../../css/model/index.ts";
import { interpretValue } from "../../css/value-semantics/index.ts";
import { tokenReference } from "../changes/model.ts";
import { selectorForManagedChange } from "../changes/managedStyleProjection.ts";
import { isElementChange, type ChangeRecord, type ElementChangeRecord } from "../changes/types.ts";
import type { InteractionState } from "../shell/styleState.ts";
import { branchForState } from "../tokens/resolution/ruleMatching.ts";
import { splitSelectorAtTopLevel } from "../tokens/resolution/selectorSemantics.ts";
import { buildTokenTable } from "../tokens/tokenAvailability.ts";
import { createInspectorValueContext } from "../tokens/valueSemanticsAdapter.ts";

/**
 * Whether a recorded style edit, previewed or not, applies to this element in this state. A base edit applies in every
 * state but those it preserves, whose `:not()` its selector carries; an edit for a state applies only in that state.
 */
function editsElement(change: ElementChangeRecord, element: HTMLElement, state: InteractionState): boolean {
  const selector = selectorForManagedChange(change);
  if (!selector) return false;
  return splitSelectorAtTopLevel(selector, ",").some((branch) => {
    // The state pseudo-class cannot be tested on a hypothetical state; the stripped branch names the element.
    const testable = branchForState(branch.trim(), state);
    if (!testable) return false;
    try {
      return element.matches(testable);
    } catch {
      return false;
    }
  });
}

function requestedValue(change: ElementChangeRecord): string {
  return change.newToken ? tokenReference(change.newToken) : change.rawValue ?? "";
}

/** The catalog may not list a token the edit links, as when its definition is scoped elsewhere; the edit still names it. */
function tableWith(table: TokenTable, token: TokenEntry | null): TokenTable {
  if (!token) return table;
  const keys = [token.name, ...(token.cssName ? [token.cssName] : [])];
  if (keys.every((key) => table[key])) return table;
  return { ...table, ...Object.fromEntries(keys.map((key) => [key, token])) };
}

/** A row already showing the edit keeps everything the resolver read from the page, such as its painted value. */
function alreadyShows(row: ResolvedProperty, declaredValue: string, tokenName: string | null): boolean {
  if (row.tokenName !== tokenName) return false;
  return tokenName !== null || row.declaredValue.trim() === declaredValue.trim();
}

/**
 * Rows read back from the page, with each recorded edit for this element taking the place of what the page shows.
 * The draft is what the user asked for; the page can lag behind it, as while a handoff check lifts the preview,
 * when later page CSS outranks the preview, or when an element lost the identity the preview targets.
 */
export function overlayDraftEdits(
  element: HTMLElement,
  rows: readonly ResolvedProperty[],
  changes: readonly ChangeRecord[],
  state: InteractionState,
  availableTokens: readonly TokenEntry[],
): readonly ResolvedProperty[] {
  const edits = changes.filter((change): change is ElementChangeRecord =>
    isElementChange(change) && requestedValue(change) !== "" && editsElement(change, element, state));
  if (edits.length === 0) return rows;

  const result = [...rows];
  const baseTable = buildTokenTable(availableTokens);
  for (const change of edits) {
    const declared = requestedValue(change);
    const context = createInspectorValueContext(tableWith(baseTable, change.newToken));
    for (const field of interpretValue(change.property, declared, context)) {
      // The edit names its token even when the value reads as something else, such as a Tailwind v3 literal.
      const tokenName = change.newToken && field.declaredValue === declared ? change.newToken.name : field.tokenName;
      const index = result.findIndex((row) => row.property === field.property);
      const base = index >= 0 ? result[index] : undefined;
      // Inline styles outrank the preview, and their fields are blocked; showing the edit there would hide why.
      if (base?.evidence.selector === "[style]") continue;
      if (base && alreadyShows(base, field.declaredValue, tokenName)) continue;
      // The edit is written on this element, so a value the page inherited is no longer the attribution.
      const { inheritedFrom: _inherited, ...evidence } = base?.evidence ?? { reason: "" };
      const row: ResolvedProperty = {
        ...base,
        property: field.property,
        tokenName,
        declaredValue: field.declaredValue,
        authored: field.declaredValue,
        sourceProperty: field.sourceProperty,
        resolvedValue: field.resolvedValue || field.declaredValue,
        resolvedTokenValue: field.resolvedValue,
        tokens: field.tokens,
        opacity: field.opacity,
        propertyOpacity: field.propertyOpacity,
        color: field.color,
        modifiers: field.modifiers,
        capability: field.capability,
        structure: field.structure,
        diagnostic: field.diagnostic,
        confidence: "exact",
        evidence: { ...evidence, reason: "recorded edit" },
      };
      if (index >= 0) result[index] = row;
      else result.push(row);
    }
  }
  return result;
}
