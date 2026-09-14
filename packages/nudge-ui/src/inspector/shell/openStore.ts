import { useSyncExternalStore } from "react";

let open = true;
const listeners = new Set<() => void>();

function subscribeOpen(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getOpen(): boolean {
  return open;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function toggleInspector(): void {
  open = !open;
  notify();
}

export function setInspectorOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  notify();
}

export { subscribeOpen, getOpen };

export function useInspectorOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, getOpen, getOpen);
}