import { useSyncExternalStore } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { applyRules, verifyPreview } from "./managedStylesheet.ts";
import type { PreviewResult, StyleRule, StyleRuleContext } from "./managedStylesheet.ts";

export interface ElementChangeRecord {
  kind?: "element";
  cid: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  /** Authored declaration that the inspector projection came from. */
  sourceProperty?: string;
  sourceAuthoredValue?: string;
  oldToken: TokenEntry | null;
  newToken: TokenEntry | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
  scope?: "source-site" | "instance-preview";
  instanceEvidence?: { renderedIndex: number; props: string | null; text: string | null };
  previewResult?: PreviewResult;
  state?: "base" | "hover" | "active" | "focus" | "focus-visible" | "disabled";
}

export interface TokenChangeRecord {
  kind: "token";
  tokenName: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  rawValue: string;
  oldRawValue: string;
  context: StyleRuleContext;
  contextLabel: string;
  source: { file: string; line: number; component: string };
  cid?: undefined;
  oldToken?: null;
  newToken?: null;
  scope?: undefined;
  instanceEvidence?: undefined;
  previewResult?: PreviewResult;
}

export type ChangeRecord = ElementChangeRecord | TokenChangeRecord;

export function isTokenChange(change: ChangeRecord): change is TokenChangeRecord {
  return change.kind === "token";
}

let changes: ChangeRecord[] = [];
interface HistoryEntry { before: ChangeRecord[]; after: ChangeRecord[] }
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getChangesSnapshot(): ChangeRecord[] {
  return changes;
}

function notify(): void {
  listeners.forEach((l) => l());
}

function recordValue(rec: ChangeRecord): string {
  if (isTokenChange(rec)) return rec.rawValue;
  if (rec.newToken) return tokenReference(rec.newToken);
  if (rec.rawValue !== undefined) return rec.rawValue;
  return "";
}

function ruleKey(rec: ChangeRecord): string {
  const context = isTokenChange(rec) ? JSON.stringify(rec.context) : "";
  return `${rec.selector}\u0000${rec.property}\u0000${context}`;
}

function changeKey(rec: ChangeRecord): string {
  if (isTokenChange(rec)) {
    return ["token", rec.tokenName, rec.file, rec.line, rec.selector, JSON.stringify(rec.context)].join("\u0000");
  }
  return [rec.cid, rec.file, rec.line, rec.selector, rec.scope ?? "source-site", rec.state ?? "base", rec.property].join("\u0000");
}

function baselineValue(rec: ChangeRecord): string {
  if (isTokenChange(rec)) return rec.oldRawValue;
  if (rec.oldToken) return tokenReference(rec.oldToken);
  return rec.oldRawValue ?? "";
}

function tokenReference(token: TokenEntry): string {
  return token.cssValue ?? `var(${token.cssName ?? token.name})`;
}

function sameEffectiveChanges(a: ChangeRecord[], b: ChangeRecord[]): boolean {
  if (a.length !== b.length) return false;
  const values = new Map(a.map((change) => [changeKey(change), recordValue(change)]));
  return b.every((change) => values.get(changeKey(change)) === recordValue(change));
}

export function getPendingRules(): StyleRule[] {
  const map = new Map<string, StyleRule>();
  for (const rec of changes) {
    const key = ruleKey(rec);
    const value = recordValue(rec);
    if (!value) continue;
    const existing = map.get(key);
    if (existing) {
      existing.declarations[rec.property] = value;
    } else {
      map.set(key, {
        selector: rec.selector,
        declarations: { [rec.property]: value },
        context: isTokenChange(rec) ? rec.context : undefined,
      });
    }
  }
  return Array.from(map.values());
}

function reapply(): void {
  applyRules(getPendingRules());
  changes = changes.map((change) => {
    const requestedValue = recordValue(change);
    let targets: HTMLElement[] = [];
    try {
      targets = Array.from(document.querySelectorAll<HTMLElement>(change.selector));
    } catch {
      targets = [];
    }
    const results = targets.length === 0
      ? [verifyPreview(null, change.property, requestedValue)]
      : targets.map((target) => verifyPreview(target, change.property, requestedValue));
    return { ...change, previewResult: results.find((result) => result.status === "conflict") ?? results[0] };
  });
}

export function appendChange(change: ChangeRecord): void {
  const before = changes;
  const key = changeKey(change);
  const existing = changes.find((candidate) => changeKey(candidate) === key);
  const canonical = existing
    ? isTokenChange(change) && isTokenChange(existing)
      ? { ...change, oldRawValue: existing.oldRawValue }
      : !isTokenChange(change) && !isTokenChange(existing)
        ? { ...change, oldToken: existing.oldToken, oldRawValue: existing.oldRawValue }
        : change
    : change;
  const next = changes.filter((candidate) => changeKey(candidate) !== key);
  const nextChanges = recordValue(canonical) !== baselineValue(canonical) ? [...next, canonical] : next;
  if (sameEffectiveChanges(before, nextChanges)) return;
  changes = nextChanges;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function revertChange(change: ChangeRecord): void {
  const before = changes;
  const key = changeKey(change);
  const next = changes.filter((c) => changeKey(c) !== key);
  if (next.length === changes.length) return;
  changes = next;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function discardChangesForSelector(selector: string): void {
  const before = changes;
  changes = changes.filter((change) => change.selector !== selector);
  if (changes.length === before.length) return;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function undo(): boolean {
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack = undoStack.slice(0, -1);
  changes = entry.before;
  reapply();
  redoStack = [...redoStack, entry];
  notify();
  return true;
}

export function redo(): boolean {
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack = redoStack.slice(0, -1);
  changes = entry.after;
  reapply();
  undoStack = [...undoStack, entry];
  notify();
  return true;
}

export function loadChanges(incoming: ChangeRecord[]): void {
  changes = [...incoming];
  undoStack = [];
  redoStack = [];
  applyRules(getPendingRules());
  notify();
}

export function clearChanges(): void {
  changes = [];
  undoStack = [];
  redoStack = [];
  applyRules([]);
  notify();
}

export function getChangesList(): ChangeRecord[] {
  return changes.slice();
}

export { subscribe as subscribeChanges, getChangesSnapshot as getChanges };

export function useChanges(): ChangeRecord[] {
  return useSyncExternalStore(subscribe, getChangesSnapshot, getChangesSnapshot);
}
