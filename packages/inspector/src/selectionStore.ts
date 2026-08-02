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

function sameComponentTargets(a: RuntimeComponentTarget[], b: RuntimeComponentTarget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    if (!right || left.framework !== right.framework) return false;
    const leftMeta = left.meta;
    const rightMeta = right.meta;
    if (leftMeta.callsiteId !== rightMeta.callsiteId
      || leftMeta.componentId !== rightMeta.componentId
      || leftMeta.componentName !== rightMeta.componentName
      || leftMeta.file !== rightMeta.file
      || leftMeta.line !== rightMeta.line
      || leftMeta.column !== rightMeta.column
      || JSON.stringify(leftMeta.authoredProps) !== JSON.stringify(rightMeta.authoredProps)) {
      return false;
    }
    // Runtime props can contain React elements and fibers with circular or
    // intentionally unstable object identities. Only primitive values are
    // consumed by the editable component-prop controls, so compare those and
    // ignore opaque values that cannot affect this panel.
    const keys = new Set([...Object.keys(left.props), ...Object.keys(right.props)]);
    for (const key of keys) {
      const leftValue = left.props[key];
      const rightValue = right.props[key];
      const leftPrimitive = typeof leftValue === "string"
        || typeof leftValue === "number"
        || typeof leftValue === "boolean";
      const rightPrimitive = typeof rightValue === "string"
        || typeof rightValue === "number"
        || typeof rightValue === "boolean";
      if (leftPrimitive || rightPrimitive) {
        if (leftValue !== rightValue) return false;
      }
    }
    return true;
  });
}

function sameResolvedMetadata(a: SelectedElement, b: SelectedElement): boolean {
  return a.cprops === b.cprops
    && a.file === b.file
    && a.line === b.line
    && a.column === b.column
    && sameComponentTargets(a.componentTargets, b.componentTargets);
}

export function setSelectedElement(el: SelectedElement | null): void {
  if (current === el) return;
  // Re-clicks and post-edit refreshes re-resolve a fresh object with the same
  // source-site identity. Keep the existing selection and hierarchy step so
  // the panel pipeline does not churn (including after step-up); edits still
  // refresh the panel via the document revision subscription.
  if (el && current
    && current.cid === el.cid
    && current.src === el.src
    && current.domElement === el.domElement) {
    if (!sameResolvedMetadata(current, el)) {
      current = el;
      notify();
    }
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
