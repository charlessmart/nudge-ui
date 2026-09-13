import type { PreviewResult, StyleRule } from "../projection/managedStylesheet.ts";
import { verifyPreview } from "../projection/managedStylesheet.ts";
import { getSelectedElement } from "../selection/selectionStore.ts";
import { instanceSelector } from "../projection/renderedInstance.ts";
import { selectorForInteractionState } from "../shell/styleState.ts";
import {
  isComponentChange,
  isTextContentChange,
  isTokenChange,
  type ChangeRecord,
  type PreviewableChangeRecord,
} from "./types.ts";
import { tokenReference } from "./model.ts";

function requestedStyleValue(change: PreviewableChangeRecord): string {
  if (isTokenChange(change)) return change.rawValue;
  if (change.newToken) return tokenReference(change.newToken);
  return change.rawValue ?? "";
}

/**
 * Token edits are controller-owned overrides, not another declaration in the
 * authored cascade. Keep conditional wrappers that describe when the source
 * declaration is active, but remove authored cascade layers so a normal
 * managed declaration can override a normal declaration inside `@layer`.
 */
function managedContext(change: PreviewableChangeRecord): StyleRule["context"] {
  if (!isTokenChange(change)) return undefined;
  const wrappers = (change.context?.wrappers ?? [])
    .filter((wrapper) => wrapper.kind !== "layer");
  return wrappers.length > 0 ? { wrappers } : undefined;
}

function ruleKey(change: PreviewableChangeRecord): string {
  const context = isTokenChange(change) ? JSON.stringify(managedContext(change)) : "";
  return `${selectorForManagedChange(change) ?? change.selector}\u0000${change.property}\u0000${context}`;
}

/** The source selector stays canonical; the projection marker is document-local. */
export function selectorForManagedChange(change: PreviewableChangeRecord): string | null {
  if (!isTokenChange(change) && change.scope === "rendered-instance") {
    if (!change.instanceOverride) return null;
    const selector = instanceSelector(change.instanceOverride);
    return selector ? selectorForInteractionState(selector, change.state ?? "base") : null;
  }
  return change.selector;
}

export function buildManagedStyleRules(changes: ChangeRecord[]): StyleRule[] {
  const sourceRules = new Map<string, StyleRule>();
  const instanceRules = new Map<string, StyleRule>();
  for (const change of changes) {
    if (isComponentChange(change) || isTextContentChange(change)) continue;
    const value = requestedStyleValue(change);
    if (!value) continue;
    const selector = selectorForManagedChange(change);
    if (!selector) continue;
    const key = ruleKey(change);
    const map = !isTokenChange(change) && change.scope === "rendered-instance"
      ? instanceRules
      : sourceRules;
    const existing = map.get(key);
    if (existing) {
      existing.declarations[change.property] = value;
    } else {
      map.set(key, {
        selector,
        declarations: { [change.property]: value },
        context: managedContext(change),
      });
    }
  }
  // Source-site rules remain the default; exact rendered-instance rules are
  // emitted afterwards so their additional marker specificity wins.
  return [...sourceRules.values(), ...instanceRules.values()];
}

export function verifyManagedStyleProjection(
  change: PreviewableChangeRecord,
  selectedElement?: HTMLElement | null,
): PreviewResult | null {
  // Deferred verification must use the selection that existed when the
  // projection was committed. Reading the live selection here can make a
  // host-document change verify against a later canvas selection (or vice
  // versa) and manufacture a conflict for the wrong document.
  const selected = selectedElement === undefined
    ? getSelectedElement()?.domElement ?? null
    : selectedElement;
  const requestedValue = requestedStyleValue(change);
  // A Canvas-only selection belongs to an iframe. The controller stylesheet
  // cannot verify it synchronously; leave its result unknown until the frame
  // has received the canonical projection rather than claiming it is stale.
  if (selected && selected.ownerDocument !== document) {
    return null;
  }
  let targets: HTMLElement[] = [];
  try {
    const selector = selectorForManagedChange(change);
    targets = selector ? Array.from(document.querySelectorAll<HTMLElement>(selector)) : [];
  } catch {
    targets = [];
  }
  // Probe targets lazily in DOM order and stop at the first conflicting
  // preview: the reported result is exactly "first conflict ?? first target",
  // so probing the remaining instances cannot change the outcome. A
  // source-site selector matched by many rendered instances (one callsite,
  // hundreds of nodes) otherwise pays a probe + important-rule scan per match.
  let firstApplied: PreviewResult | null = null;
  let previewResult: PreviewResult | null = null;
  for (const target of targets) {
    const result = verifyPreview(target, change.property, requestedValue);
    if (result.status === "conflict") {
      previewResult = result;
      break;
    }
    if (!firstApplied) firstApplied = result;
  }
  if (previewResult === null) {
    previewResult = firstApplied ?? verifyPreview(null, change.property, requestedValue);
  }
  return previewResult;
}
