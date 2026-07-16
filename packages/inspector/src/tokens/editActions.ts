import type { TokenEntry } from "virtual:design-tokens";
import { parseDataSrc } from "../resolveSelection.ts";
import {
  appendChange,
  getPendingRules,
} from "../changesLog.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changesLog.ts";
import { getEditScope, getInstanceEvidence, selectorForElement, sourceSiteSelector } from "../editScope.ts";

export type { ChangeRecord } from "../changesLog.ts";
export { getPendingRules, getChangesList as getChangeRecords, clearChanges as resetPendingRules } from "../changesLog.ts";

export function buildSelector(cid: string, src: string): string | null {
  return sourceSiteSelector(cid, src);
}

function scopeFields(el: HTMLElement) {
  const scope = getEditScope(el);
  return { scope, instanceEvidence: scope === "instance-preview" ? getInstanceEvidence(el) : undefined };
}

export function swapToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
  oldToken: TokenEntry | null,
): ElementChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const selector = selectorForElement(el);
  if (!selector) return null;
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  const line = parsed ? parsed.line : 0;

  const record: ElementChangeRecord = {
    cid,
    file,
    line,
    selector,
    property,
    oldToken,
    newToken,
    source: { file, line, component: cid },
    ...scopeFields(el),
  };
  appendChange(record);
  return record;
}

export function setStyle(el: HTMLElement, property: string, value: string): ElementChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const selector = selectorForElement(el);
  if (!selector) return null;
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  const line = parsed ? parsed.line : 0;

  const oldRawValue = (() => {
    try {
      const v = getComputedStyle(el).getPropertyValue(property);
      return v.trim() || undefined;
    } catch {
      return undefined;
    }
  })();

  const record: ElementChangeRecord = {
    cid,
    file,
    line,
    selector,
    property,
    oldToken: null,
    newToken: null,
    rawValue: value,
    oldRawValue,
    source: { file, line, component: cid },
    ...scopeFields(el),
  };
  appendChange(record);
  return record;
}

export function promoteToToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
): ElementChangeRecord | null {
  return swapToken(el, property, newToken, null);
}
