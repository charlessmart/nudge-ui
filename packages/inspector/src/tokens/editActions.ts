import type { TokenEntry } from "virtual:design-tokens";
import { parseDataSrc } from "../resolveSelection.ts";
import { escapeAttrValue } from "../managedStylesheet.ts";
import {
  appendChange,
  getPendingRules,
} from "../changesLog.ts";
import type { ChangeRecord } from "../changesLog.ts";

export type { ChangeRecord } from "../changesLog.ts";
export { getPendingRules, getChangesList as getChangeRecords, clearChanges as resetPendingRules } from "../changesLog.ts";

export function buildSelector(cid: string, src: string): string | null {
  if (!cid) return null;
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  if (!file) return null;
  return `[data-cid="${escapeAttrValue(cid)}"][data-src*="${escapeAttrValue(file)}"]`;
}

export function swapToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
  oldToken: TokenEntry | null,
): ChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const selector = buildSelector(cid, src);
  if (!selector) return null;
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  const line = parsed ? parsed.line : 0;

  const record: ChangeRecord = {
    cid,
    file,
    line,
    selector,
    property,
    oldToken,
    newToken,
    source: { file, line, component: cid },
  };
  appendChange(record);
  return record;
}

export function setStyle(el: HTMLElement, property: string, value: string): ChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const selector = buildSelector(cid, src);
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

  const record: ChangeRecord = {
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
  };
  appendChange(record);
  return record;
}

export function promoteToToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
): ChangeRecord | null {
  return swapToken(el, property, newToken, null);
}
