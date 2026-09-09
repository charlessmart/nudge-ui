import type { PreviewResult, StyleRule } from "../managedStylesheet.ts";
import { verifyPreview } from "../managedStylesheet.ts";
import { getSelectedElement } from "../selectionStore.ts";
import { instanceSelector } from "../renderedInstance.ts";
import { selectorForInteractionState } from "../styleState.ts";
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

function ruleKey(change: PreviewableChangeRecord): string {
  const context = isTokenChange(change) ? JSON.stringify(change.context) : "";
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
        context: isTokenChange(change) ? change.context : undefined,
      });
    }
  }
  return [...sourceRules.values(), ...instanceRules.values()];
}

export function verifyManagedStyleProjection(
  change: PreviewableChangeRecord,
  selectedElement?: HTMLElement | null,
): PreviewableChangeRecord {
  const selected = selectedElement === undefined
    ? getSelectedElement()?.domElement ?? null
    : selectedElement;
  const requestedValue = requestedStyleValue(change);
  if (selected && selected.ownerDocument !== document) {
    return { ...change, previewResult: undefined };
  }
  let targets: HTMLElement[] = [];
  try {
    const selector = selectorForManagedChange(change);
    targets = selector ? Array.from(document.querySelectorAll<HTMLElement>(selector)) : [];
  } catch {
    targets = [];
  }
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
  return { ...change, previewResult };
}
