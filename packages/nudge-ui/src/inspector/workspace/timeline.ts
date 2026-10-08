import type { DraftContents } from "../drafts/model.ts";

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
type ContentsEqual = (a: DraftContents, b: DraftContents) => boolean;

/** Session undo: one ordered history shared by draft edits and Canvas operations. */
export interface Timeline {
  subscribe(listener: () => void): () => void;
  status(): { canUndo: boolean; canRedo: boolean };
  recordEdit(entry: Omit<EditHistoryEntry, "kind" | "group">, equal: ContentsEqual): void;
  recordCanvasChange(entry: Omit<CanvasHistoryEntry, "kind">): void;
  replay(direction: "undo" | "redo", applyEdit: (entry: EditHistoryEntry, contents: DraftContents) => void): boolean;
  pruneDraftHistory(draftId: string, retain: (contents: DraftContents) => DraftContents, equal: ContentsEqual): void;
  discardDraftHistory(draftId: string): void;
  discardCanvasHistory(cardId: string): void;
  clear(): void;
  releaseDetachedIterations(): void;
  createGroup(): (update: () => void) => void;
}

export function createTimeline(): Timeline {
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  let activeGroup: symbol | undefined;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const discardRedo = (): void => {
    const discarded = redoStack;
    redoStack = [];
    for (const entry of discarded) if (entry.kind === "canvas") entry.dispose();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => ({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }),
    recordEdit(entry, equal) {
      const previous = undoStack.at(-1);
      const grouped = activeGroup && previous?.kind === "edit" && previous.draftId === entry.draftId && previous.group === activeGroup;
      const next: EditHistoryEntry = { kind: "edit", ...entry, before: grouped ? previous.before : entry.before, group: activeGroup };
      if (grouped) undoStack.pop();
      if (!equal(next.before, next.after)) undoStack.push(next);
      discardRedo();
      notify();
    },
    recordCanvasChange(entry) {
      discardRedo();
      undoStack.push({ kind: "canvas", ...entry });
      notify();
    },
    replay(direction, applyEdit) {
      const source = direction === "undo" ? undoStack : redoStack;
      const destination = direction === "undo" ? redoStack : undoStack;
      const entry = source.pop();
      if (!entry) return false;
      if (entry.kind === "edit") applyEdit(entry, direction === "undo" ? entry.before : entry.after);
      else entry[direction]();
      destination.push(entry);
      notify();
      return true;
    },
    pruneDraftHistory(draftId, retain, equal) {
      const prune = (entries: readonly HistoryEntry[]): HistoryEntry[] => entries.flatMap((entry) => {
        if (entry.kind !== "edit" || entry.draftId !== draftId) return [entry];
        const next = { ...entry, before: retain(entry.before), after: retain(entry.after) };
        return equal(next.before, next.after) ? [] : [next];
      });
      undoStack = prune(undoStack);
      redoStack = prune(redoStack);
      notify();
    },
    discardDraftHistory(draftId) {
      const retain = (entry: HistoryEntry) => entry.kind !== "edit" || entry.draftId !== draftId;
      undoStack = undoStack.filter(retain);
      redoStack = redoStack.filter(retain);
      notify();
    },
    discardCanvasHistory(cardId) {
      const retain = (entry: HistoryEntry) => entry.kind !== "canvas" || !entry.cardIds.includes(cardId);
      undoStack = undoStack.filter(retain);
      const discarded = redoStack.filter((entry) => !retain(entry));
      redoStack = redoStack.filter(retain);
      for (const entry of discarded) if (entry.kind === "canvas") entry.dispose();
      notify();
    },
    clear() {
      const discarded = [...undoStack, ...redoStack];
      undoStack = [];
      redoStack = [];
      for (const entry of discarded) if (entry.kind === "canvas") entry.dispose();
      notify();
    },
    releaseDetachedIterations() {
      discardRedo();
      for (const entry of undoStack) if (entry.kind === "canvas") entry.dispose();
      notify();
    },
    createGroup() {
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
    },
  };
}

/** The Workspace's session timeline. */
export const sessionTimeline = createTimeline();

export function recordCanvasChange(entry: Omit<CanvasHistoryEntry, "kind">): void {
  sessionTimeline.recordCanvasChange(entry);
}

export function discardCanvasHistory(cardId: string): void {
  sessionTimeline.discardCanvasHistory(cardId);
}

export function discardDraftHistory(draftId: string): void {
  sessionTimeline.discardDraftHistory(draftId);
}

export function clearSessionUndoHistory(): void {
  sessionTimeline.clear();
}

export function releaseDetachedIterations(): void {
  sessionTimeline.releaseDetachedIterations();
}

export function createChangeHistoryGroup(): (update: () => void) => void {
  return sessionTimeline.createGroup();
}
