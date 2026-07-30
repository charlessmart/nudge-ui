import type { TokenEntry } from "virtual:design-tokens";
import { applyRules, verifyPreview } from "../managedStylesheet.ts";
import type { StyleRule } from "../managedStylesheet.ts";
import { getSelectedElement } from "../selectionStore.ts";
import { replaceComponentOverrideProjection } from "../componentSemantics/index.ts";
import { componentChangeToOverride } from "../componentSemantics/changeModel.ts";
import {
  isComponentChange,
  isTokenChange,
  type ChangeRecord,
  type PreviewableChangeRecord,
} from "./types.ts";

function tokenReference(token: TokenEntry): string {
  return token.cssValue ?? `var(${token.cssName ?? token.name})`;
}

function requestedStyleValue(change: PreviewableChangeRecord): string {
  if (isTokenChange(change)) return change.rawValue;
  if (change.newToken) return tokenReference(change.newToken);
  return change.rawValue ?? "";
}

function ruleKey(change: PreviewableChangeRecord): string {
  const context = isTokenChange(change) ? JSON.stringify(change.context) : "";
  return `${change.selector}\u0000${change.property}\u0000${context}`;
}

export function buildManagedStyleRules(changes: ChangeRecord[]): StyleRule[] {
  const map = new Map<string, StyleRule>();
  for (const change of changes) {
    if (isComponentChange(change)) continue;
    const value = requestedStyleValue(change);
    if (!value) continue;
    const key = ruleKey(change);
    const existing = map.get(key);
    if (existing) {
      existing.declarations[change.property] = value;
    } else {
      map.set(key, {
        selector: change.selector,
        declarations: { [change.property]: value },
        context: isTokenChange(change) ? change.context : undefined,
      });
    }
  }
  return [...map.values()];
}

function verifyManagedStyleProjection(
  change: PreviewableChangeRecord,
): PreviewableChangeRecord {
  const selected = getSelectedElement();
  const requestedValue = requestedStyleValue(change);
  // A Canvas-only selection belongs to an iframe. The controller stylesheet
  // cannot verify it synchronously; leave its result unknown until the frame
  // has received the canonical projection rather than claiming it is stale.
  if (
    selected
    && selected.domElement.ownerDocument !== document
    && selected.domElement.matches(change.selector)
  ) {
    return { ...change, previewResult: undefined };
  }
  let targets: HTMLElement[] = [];
  try {
    targets = Array.from(document.querySelectorAll<HTMLElement>(change.selector));
  } catch {
    targets = [];
  }
  const results = targets.length === 0
    ? [verifyPreview(null, change.property, requestedValue)]
    : targets.map((target) =>
        verifyPreview(target, change.property, requestedValue));
  return {
    ...change,
    previewResult:
      results.find((result) => result.status === "conflict") ?? results[0],
  };
}

export function applyChangeProjections(
  changes: ChangeRecord[],
  verify = true,
): ChangeRecord[] {
  applyRules(buildManagedStyleRules(changes));
  replaceComponentOverrideProjection(
    changes.filter(isComponentChange).map(componentChangeToOverride),
  );
  if (!verify) return changes;
  return changes.map((change) =>
    isComponentChange(change) ? change : verifyManagedStyleProjection(change));
}
