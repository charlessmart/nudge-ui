import { useSyncExternalStore } from "react";

interface SketchNoteSnapshot {
  readonly sketchId: string | null;
}

const EMPTY_SNAPSHOT: SketchNoteSnapshot = { sketchId: null };
let snapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function publish(next: SketchNoteSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getSketchNoteSnapshot(): SketchNoteSnapshot {
  return snapshot;
}

export function subscribeSketchNote(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSketchNote(): SketchNoteSnapshot {
  return useSyncExternalStore(subscribeSketchNote, getSketchNoteSnapshot, getSketchNoteSnapshot);
}

export function openSketchNote(sketchId: string): void {
  publish({ sketchId });
}

export function closeSketchNote(): void {
  if (snapshot.sketchId === null) return;
  publish(EMPTY_SNAPSHOT);
}

export function resetSketchNote(): void {
  snapshot = EMPTY_SNAPSHOT;
}
