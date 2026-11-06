import { isElementChange, type ChangeRecord } from "../changes/types.ts";
import { scopeSelectorToVariant } from "../componentSemantics/variantMarkers.ts";
import { componentsTarget, targetKey } from "../drafts/model.ts";

const SOURCE_SITE_SELECTOR = /^\[data-cid="(?:[^"\\]|\\.)*"\]\[data-src="((?:[^"\\]|\\.)*)"\](.*)$/s;

export const COMPONENTS_DRAFT_ID = targetKey(componentsTarget());

/**
 * Component definitions forward the callsite's identity onto their root, so a definition-site rule must also match
 * the `data-nudge-def` marker the compiler leaves on the definition's own element.
 */
export function rewriteSourceSiteSelector(selector: string): string {
  const match = SOURCE_SITE_SELECTOR.exec(selector);
  if (!match) return selector;
  const [, src, rest] = match;
  return `:is([data-src="${src}"], [data-nudge-def="${src}"])${rest}`;
}

/** Only source-site style edits cross into other frames; instance, text, and structural intent stay with their draft. */
export function shareableComponentChanges(changes: readonly ChangeRecord[]): ChangeRecord[] {
  return changes.flatMap((change) => {
    if (!isElementChange(change) || change.scope === "rendered-instance" || change.instanceOverride) return [];
    const selector = rewriteSourceSiteSelector(change.selector);
    return [{ ...change, selector: change.variantScope ? scopeSelectorToVariant(selector, change.variantScope) : selector }];
  });
}

/** The components draft's own frames (component sheets) narrow variant-scoped edits the same way other frames do. */
export function scopeVariantChanges(changes: readonly ChangeRecord[]): ChangeRecord[] {
  return changes.map((change) => isElementChange(change) && change.variantScope && change.scope !== "rendered-instance"
    ? { ...change, selector: scopeSelectorToVariant(change.selector, change.variantScope) }
    : change);
}
