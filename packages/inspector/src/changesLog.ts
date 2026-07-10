import { useSyncExternalStore } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { applyRules } from "./managedStylesheet.ts";
import type { StyleRule } from "./managedStylesheet.ts";

export interface ChangeRecord {
  cid: string;
  file: string;
  line: number;
  selector: string;
  property: string;
  oldToken: TokenEntry | null;
  newToken: TokenEntry | null;
  rawValue?: string;
  oldRawValue?: string;
  source: { file: string; line: number; component: string };
}

let changes: ChangeRecord[] = [];
let undoStack: ChangeRecord[] = [];
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
  if (rec.newToken) return `var(${rec.newToken.name})`;
  if (rec.rawValue !== undefined) return rec.rawValue;
  return "";
}

function ruleKey(rec: ChangeRecord): string {
  return `${rec.selector}\u0000${rec.property}`;
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
      map.set(key, { selector: rec.selector, declarations: { [rec.property]: value } });
    }
  }
  return Array.from(map.values());
}

function reapply(): void {
  applyRules(getPendingRules());
}

export function appendChange(change: ChangeRecord): void {
  undoStack = [];
  changes = [...changes, change];
  notify();
  reapply();
}

export function revertChange(change: ChangeRecord): void {
  undoStack = [];
  const next = changes.filter((c) => c !== change);
  if (next.length === changes.length) return;
  changes = next;
  notify();
  reapply();
}

export function undo(): boolean {
  if (changes.length === 0) return false;
  const popped = changes.at(-1)!;
  changes = changes.slice(0, -1);
  undoStack.push(popped);
  notify();
  reapply();
  return true;
}

export function redo(): boolean {
  if (undoStack.length === 0) return false;
  const popped = undoStack.at(-1)!;
  undoStack = undoStack.slice(0, -1);
  changes = [...changes, popped];
  notify();
  reapply();
  return true;
}

export function clearChanges(): void {
  changes = [];
  undoStack = [];
  notify();
}

export function getChangesList(): ChangeRecord[] {
  return changes.slice();
}

export { subscribe as subscribeChanges, getChangesSnapshot as getChanges };

export function useChanges(): ChangeRecord[] {
  return useSyncExternalStore(subscribe, getChangesSnapshot, getChangesSnapshot);
}
