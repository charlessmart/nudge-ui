import type { TokenEntry } from "virtual:design-tokens";
import { parseDataSrc } from "../resolveSelection.ts";
import {
  appendChange,
  appendChanges,
  getPendingRules,
} from "../changesLog.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changesLog.ts";
import { getEditScope, selectorForElement, sourceSiteSelector } from "../editScope.ts";
import { getRenderedInstanceOverride } from "../renderedInstance.ts";
import { getActiveStyleState, selectorForInteractionState } from "../styleState.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { isRuntimeGeneratedSource } from "../staticHtmlRuntimeIdentity.ts";

function boundedRenderedText(el: HTMLElement): string | null {
  const text = el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
  return text || null;
}

function sourceFields(el: HTMLElement): {
  file: string;
  line: number;
  column: number;
  runtimeEvidence?: ElementChangeRecord["runtimeEvidence"];
} {
  const src = el.getAttribute("data-src") ?? "";
  const parsed = parseDataSrc(src);
  if (isRuntimeGeneratedSource(src)) {
    return {
      file: "",
      line: 0,
      column: 0,
      runtimeEvidence: {
        tagName: el.tagName.toLowerCase(),
        text: boundedRenderedText(el),
        props: el.getAttribute("data-cprops"),
        ariaLabel: el.getAttribute("aria-label"),
      },
    };
  }
  return {
    file: parsed?.file ?? src,
    line: parsed?.line ?? 0,
    column: parsed?.column ?? 0,
  };
}

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
  return {
    scope,
    instanceOverride: scope === "rendered-instance" ? getRenderedInstanceOverride(el) ?? undefined : undefined,
  };
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
  const source = sourceFields(el);

  const record: ElementChangeRecord = {
    cid,
    file: source.file,
    line: source.line,
    column: source.column,
    selector,
    property,
    ...metadata,
    oldToken,
    newToken,
    source: { file: source.file, line: source.line, component: cid },
    runtimeEvidence: source.runtimeEvidence,
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
  const source = sourceFields(el);

  const oldRawValue = getStateStyleValue(el, property) || undefined;

  const record: ElementChangeRecord = {
    cid,
    file: source.file,
    line: source.line,
    column: source.column,
    selector,
    property,
    ...metadata,
    oldToken: null,
    newToken: null,
    rawValue: value,
    oldRawValue,
    source: { file: source.file, line: source.line, component: cid },
    runtimeEvidence: source.runtimeEvidence,
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
  const source = sourceFields(el);
  const records = declarations.map(({ property, value }) => ({
    cid,
    file: source.file,
    line: source.line,
    selector,
    property,
    ...metadata,
    oldToken: null,
    newToken: null,
    rawValue: value,
    oldRawValue: getStateStyleValue(el, property) || undefined,
    column: source.column,
    source: { file: source.file, line: source.line, component: cid },
    runtimeEvidence: source.runtimeEvidence,
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
