import type { TokenEntry } from "virtual:design-tokens";
import { parseDataSrc } from "../resolveSelection.ts";
import {
  appendChange,
  appendChanges,
  getPendingRules,
} from "../changesLog.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changesLog.ts";
import { getEditScope, getInstanceEvidence, selectorForElement, sourceSiteSelector } from "../editScope.ts";
import { getActiveStyleState, selectorForInteractionState } from "../styleState.ts";
import { getStateStyleValue } from "../stateValue.ts";

export type { ChangeRecord } from "../changesLog.ts";
export { getPendingRules, getChangesList as getChangeRecords, clearChanges as resetPendingRules } from "../changesLog.ts";

export interface StyleEditMetadata {
  sourceProperty?: string;
  sourceAuthoredValue?: string;
}

export function buildSelector(cid: string, src: string): string | null {
  return sourceSiteSelector(cid, src);
}

function scopeFields(el: HTMLElement) {
  const scope = getEditScope(el);
  return { scope, instanceEvidence: scope === "instance-preview" ? getInstanceEvidence(el) : undefined };
}

function stateFields(el: HTMLElement) {
  const state = getActiveStyleState();
  const selector = selectorForElement(el);
  return { state, selector: selector ? selectorForInteractionState(selector, state) : null };
}

export function swapToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
  oldToken: TokenEntry | null,
  metadata?: StyleEditMetadata,
): ElementChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const { selector, state } = stateFields(el);
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
    ...metadata,
    oldToken,
    newToken,
    source: { file, line, component: cid },
    state,
    ...scopeFields(el),
  };
  appendChange(record);
  return record;
}

export function setStyle(el: HTMLElement, property: string, value: string, metadata?: StyleEditMetadata): ElementChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const { selector, state } = stateFields(el);
  if (!selector) return null;
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  const line = parsed ? parsed.line : 0;

  const oldRawValue = getStateStyleValue(el, property) || undefined;

  const record: ElementChangeRecord = {
    cid,
    file,
    line,
    selector,
    property,
    ...metadata,
    oldToken: null,
    newToken: null,
    rawValue: value,
    oldRawValue,
    source: { file, line, component: cid },
    state,
    ...scopeFields(el),
  };
  appendChange(record);
  return record;
}

export function setStyles(
  el: HTMLElement,
  declarations: ReadonlyArray<{ property: string; value: string }>,
  metadata?: StyleEditMetadata,
): ElementChangeRecord[] {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const { selector, state } = stateFields(el);
  if (!selector) return [];
  const parsed = parseDataSrc(src);
  const file = parsed ? parsed.file : src;
  const line = parsed ? parsed.line : 0;
  const records = declarations.map(({ property, value }) => ({
    cid,
    file,
    line,
    selector,
    property,
    ...metadata,
    oldToken: null,
    newToken: null,
    rawValue: value,
    oldRawValue: getStateStyleValue(el, property) || undefined,
    source: { file, line, component: cid },
    state,
    ...scopeFields(el),
  } satisfies ElementChangeRecord));
  appendChanges(records);
  return records;
}

export function promoteToToken(
  el: HTMLElement,
  property: string,
  newToken: TokenEntry,
  metadata?: StyleEditMetadata,
): ElementChangeRecord | null {
  return swapToken(el, property, newToken, null, metadata);
}
