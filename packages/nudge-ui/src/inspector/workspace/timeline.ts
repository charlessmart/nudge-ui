import type { DraftContents } from "../changes/draftChanges.ts";

export interface EditHistoryEntry {
  readonly kind: "edit";
  readonly draftId: string;
  readonly group?: symbol;
  readonly before: DraftContents;
  readonly after: DraftContents;
  readonly activate?: () => void;
}

export interface CanvasHistoryEntry {
  readonly kind: "canvas";
  readonly cardIds: readonly string[];
  readonly undo: () => void;
  readonly redo: () => void;
  readonly dispose: () => void;
}

type HistoryEntry = EditHistoryEntry | CanvasHistoryEntry;
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let activeGroup: symbol | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function discardRedo(): void {
  const discarded = redoStack;
  redoStack = [];
  for (const entry of discarded) if (entry.kind === "canvas") entry.dispose();
}

export function subscribeTimeline(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function timelineStatus(): { canUndo: boolean; canRedo: boolean } {
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

export function recordEdit(entry: Omit<EditHistoryEntry, "kind" | "group">, equal: (a: DraftContents, b: DraftContents) => boolean): void {
  const previous = undoStack.at(-1);
  const grouped = activeGroup && previous?.kind === "edit" && previous.draftId === entry.draftId && previous.group === activeGroup;
  const next: EditHistoryEntry = { kind: "edit", ...entry, before: grouped ? previous.before : entry.before, group: activeGroup };
  if (grouped) undoStack.pop();
  if (!equal(next.before, next.after)) undoStack.push(next);
  discardRedo();
  notify();
}

export function recordCanvasCreation(entry: Omit<CanvasHistoryEntry, "kind">): void {
  discardRedo();
  undoStack.push({ kind: "canvas", ...entry });
  notify();
}

export function replayTimeline(direction: "undo" | "redo", applyEdit: (entry: EditHistoryEntry, contents: DraftContents) => void): boolean {
  const source = direction === "undo" ? undoStack : redoStack;
  const destination = direction === "undo" ? redoStack : undoStack;
  const entry = source.pop();
  if (!entry) return false;
  if (entry.kind === "edit") applyEdit(entry, direction === "undo" ? entry.before : entry.after);
  else entry[direction]();
  destination.push(entry);
  notify();
  return true;
}

export function pruneDraftHistory(draftId: string, retain: (contents: DraftContents) => DraftContents, equal: (a: DraftContents, b: DraftContents) => boolean): void {
  const prune = (entries: readonly HistoryEntry[]): HistoryEntry[] => entries.flatMap((entry) => {
    if (entry.kind !== "edit" || entry.draftId !== draftId) return [entry];
    const next = { ...entry, before: retain(entry.before), after: retain(entry.after) };
    return equal(next.before, next.after) ? [] : [next];
  });
  undoStack = prune(undoStack);
  redoStack = prune(redoStack);
  notify();
}

export function discardDraftHistory(draftId: string): void {
  const retain = (entry: HistoryEntry) => entry.kind !== "edit" || entry.draftId !== draftId;
  undoStack = undoStack.filter(retain);
  redoStack = redoStack.filter(retain);
  notify();
}

export function discardCanvasHistory(cardId: string): void {
  const retain = (entry: HistoryEntry) => entry.kind !== "canvas" || !entry.cardIds.includes(cardId);
  undoStack = undoStack.filter(retain);
  const discarded = redoStack.filter((entry) => !retain(entry));
  redoStack = redoStack.filter(retain);
  for (const entry of discarded) if (entry.kind === "canvas") entry.dispose();
  notify();
}

export function clearSessionUndoHistory(): void {
  discardRedo();
  undoStack = [];
  notify();
}

export function releaseDetachedIterations(): void {
  discardRedo();
  notify();
}

export function createChangeHistoryGroup(): (update: () => void) => void {
  const group = Symbol("change-history-group");
  return (update) => {
    const previous = activeGroup;
    activeGroup = group;
    try {
      update();
    } finally {
      activeGroup = previous;
    }
  };
}
