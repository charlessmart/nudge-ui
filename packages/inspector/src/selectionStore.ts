import { useSyncExternalStore } from "react";
import { computeHierarchy } from "./hierarchy.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import type { RuntimeComponentTarget } from "./componentSemantics/types.ts";

export interface SelectedElement {
  cid: string;
  src: string;
  cprops: string | null;
  file: string;
  line: number;
  column: number;
  domElement: HTMLElement;
  fiber?: unknown;
  componentTargets: RuntimeComponentTarget[];
}

let current: SelectedElement | null = null;
let chain: HTMLElement[] = [];
let index = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSelectedElement(): SelectedElement | null {
  return current;
}

function getHierarchy(): HTMLElement[] {
  return chain;
}

function getHierarchyIndex(): number {
  return index;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function setSelectedElement(el: SelectedElement | null): void {
  if (current === el) return;
  // Re-clicks and post-edit refreshes re-resolve a fresh object with the same
  // source-site identity. Keep the existing selection (and the hierarchy step)
  // so the panel pipeline does not churn; edits still refresh the panel via
  // the document revision subscription.
  if (el && current
    && current.cid === el.cid
    && current.src === el.src
    && current.domElement === el.domElement
    && index === 0) {
    return;
  }
  current = el;
  chain = el ? computeHierarchy(el.domElement) : [];
  index = 0;
  notify();
}

function applyStep(newIndex: number): void {
  if (newIndex < 0 || newIndex >= chain.length) return;
  if (newIndex === index) return;
  index = newIndex;
  const node = chain[index];
  if (node) {
    const resolved = resolveSelectionFromElement(node);
    if (resolved) current = resolved;
  }
  notify();
}

export function stepUp(): void {
  if (index < chain.length - 1) applyStep(index + 1);
}

export function stepDown(): void {
  if (index > 0) applyStep(index - 1);
}

export function setHierarchyIndex(i: number): void {
  applyStep(i);
}

export { subscribe, getSelectedElement, getHierarchy, getHierarchyIndex };

export function useSelectedElement(): SelectedElement | null {
  return useSyncExternalStore(subscribe, getSelectedElement, getSelectedElement);
}

export function useHierarchy(): HTMLElement[] {
  return useSyncExternalStore(subscribe, getHierarchy, getHierarchy);
}

export function useHierarchyIndex(): number {
  return useSyncExternalStore(subscribe, getHierarchyIndex, getHierarchyIndex);
}
