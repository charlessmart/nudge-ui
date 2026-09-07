import type { TokenEntry } from "virtual:design-tokens";
import { parseDataSrc } from "../resolveSelection.ts";
import {
  appendChanges,
} from "../changesLog.ts";
import type { ElementChangeRecord } from "../changesLog.ts";
import { getBatchEditScope, selectorForElement, sourceSiteSelector } from "../editScope.ts";
import { getActiveStyleState, selectorForInteractionState } from "../styleState.ts";
import { getStateStyleValue } from "../stateValue.ts";
import {
  boundRuntimeEvidence,
  isRuntimeCreatedElement,
  isRuntimeGeneratedSource,
  normalizeRuntimeTag,
  normalizeRuntimeText,
} from "../staticHtmlRuntimeIdentity.ts";
import { targetElements, type EditTarget } from "../editTarget.ts";
import { changeKey } from "../changes/model.ts";

function boundedRenderedText(el: HTMLElement): string | null {
  return normalizeRuntimeText(el.textContent);
}

function sourceFields(el: HTMLElement): {
  file: string;
  line: number;
  column: number;
  runtimeEvidence?: ElementChangeRecord["runtimeEvidence"];
} {
  const src = el.getAttribute("data-src") ?? "";
  const parsed = parseDataSrc(src);
  const evidence = (reason: NonNullable<
    ElementChangeRecord["runtimeEvidence"]
  >["reason"]): ElementChangeRecord["runtimeEvidence"] => ({
    reason,
    tagName: normalizeRuntimeTag(el.tagName),
    text: boundedRenderedText(el),
    props: boundRuntimeEvidence(el.getAttribute("data-cprops")),
    ariaLabel: boundRuntimeEvidence(el.getAttribute("aria-label")),
  });
  if (isRuntimeCreatedElement(el) || isRuntimeGeneratedSource(src)) {
    return {
      file: "",
      line: 0,
      column: 0,
      runtimeEvidence: evidence("runtime-created"),
    };
  }
  if (!parsed) {
    // Authored markup whose source annotation is absent or unusable — for
    // example Astro dev-annotation degraded mode. Prompts must say the
    // location is unknown instead of rendering a fabricated `file:0`.
    return {
      file: "",
      line: 0,
      column: 0,
      runtimeEvidence: evidence("unannotated"),
    };
  }
  return {
    file: parsed.file,
    line: parsed.line,
    column: parsed.column,
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

function scopeFields(el: HTMLElement, selectedElements: readonly HTMLElement[]) {
  return getBatchEditScope(el, selectedElements);
}

function stateFields(el: HTMLElement) {
  const state = getActiveStyleState();
  const selector = selectorForElement(el);
  return { state, selector: selector ? selectorForInteractionState(selector, state) : null };
}

export function swapToken(
  target: EditTarget,
  property: string,
  newToken: TokenEntry,
  oldToken: TokenEntry | null,
  metadata?: StyleEditMetadata,
): ElementChangeRecord | null {
  const elements = targetElements(target);
  const records: ElementChangeRecord[] = [];
  const verificationTargets = new Map<string, HTMLElement | null>();
  for (const el of elements) {
    const cid = el.getAttribute("data-cid") ?? "";
    const { selector, state } = stateFields(el);
    if (!selector) continue;
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
      ...scopeFields(el, elements),
    };
    records.push(record);
    verificationTargets.set(changeKey(record), el);
  }
  appendChanges(records, { verificationTargets });
  return records[0] ?? null;
}

export function setStyle(target: EditTarget, property: string, value: string, metadata?: StyleEditMetadata): ElementChangeRecord | null {
  const elements = targetElements(target);
  const records: Array<{ record: ElementChangeRecord; element: HTMLElement }> = [];
  for (const el of elements) {
    const record = buildStyleRecord(el, elements, property, value, metadata);
    if (record) records.push({ record, element: el });
  }
  const verificationTargets = new Map<string, HTMLElement | null>();
  for (const { record, element } of records) verificationTargets.set(changeKey(record), element);
  appendChanges(records.map(({ record }) => record), { verificationTargets });
  return records[0]?.record ?? null;
}

export function setStyles(
  target: EditTarget,
  declarations: ReadonlyArray<{ property: string; value: string }>,
  metadata?: StyleEditMetadata,
): ElementChangeRecord[] {
  const elements = targetElements(target);
  const records: Array<{ record: ElementChangeRecord; element: HTMLElement }> = [];
  for (const el of elements) {
    for (const { property, value } of declarations) {
      const record = buildStyleRecord(el, elements, property, value, metadata);
      if (record) records.push({ record, element: el });
    }
  }
  const verificationTargets = new Map<string, HTMLElement | null>();
  for (const { record, element } of records) verificationTargets.set(changeKey(record), element);
  appendChanges(records.map(({ record }) => record), { verificationTargets });
  return records.map(({ record }) => record);
}

function buildStyleRecord(
  el: HTMLElement,
  selectedElements: readonly HTMLElement[],
  property: string,
  value: string,
  metadata?: StyleEditMetadata,
): ElementChangeRecord | null {
  const cid = el.getAttribute("data-cid") ?? "";
  const { selector, state } = stateFields(el);
  if (!selector) return null;
  const source = sourceFields(el);
  return {
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
    oldRawValue: getStateStyleValue(el, property) || undefined,
    source: { file: source.file, line: source.line, component: cid },
    runtimeEvidence: source.runtimeEvidence,
    state,
    ...scopeFields(el, selectedElements),
  } satisfies ElementChangeRecord;
}

export function promoteToToken(
  el: EditTarget,
  property: string,
  newToken: TokenEntry,
  metadata?: StyleEditMetadata,
): ElementChangeRecord | null {
  return swapToken(el, property, newToken, null, metadata);
}
