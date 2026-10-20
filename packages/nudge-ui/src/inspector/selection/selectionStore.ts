import { useSyncExternalStore } from "react";
import { computeHierarchy } from "./hierarchy.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { isPageTarget } from "./pageTarget.ts";
import type { RuntimeComponentTarget } from "../componentSemantics/types.ts";
import { clearInlineTextDiagnosticsForSelection } from "../inline-text/inlineTextDiagnostics.ts";

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

export interface Selection {
  elements: readonly SelectedElement[];
  primary: SelectedElement;
}

let currentSelection: Selection | null = null;
const EMPTY_SELECTION: readonly SelectedElement[] = [];
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
  return currentSelection?.primary ?? null;
}

function getSelectedElements(): readonly SelectedElement[] {
  return currentSelection?.elements ?? EMPTY_SELECTION;
}

function getSelection(): Selection | null {
  return currentSelection;
}

function getHierarchy(): HTMLElement[] {
  return chain;
}

function getHierarchyIndex(): number {
  return index;
}

function notify(): void {
  clearInlineTextDiagnosticsForSelection(getSelectedElements().map((element) => element.domElement));
  listeners.forEach((l) => l());
}

function sameComponentTargets(a: RuntimeComponentTarget[], b: RuntimeComponentTarget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    if (!right || left.framework !== right.framework || left.livePreview !== right.livePreview) return false;
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
    // Runtime props can hold React elements and fibers with unstable identities; only primitives affect the editable prop controls.
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
  if (!el) {
    if (!currentSelection) return;
    currentSelection = null;
    chain = [];
    index = 0;
    notify();
    return;
  }

  const current = currentSelection?.primary ?? null;
  if ((currentSelection?.elements.length ?? 0) > 1) {
    // The replacement API must collapse a group even when the clicked node is already primary.
    publishSelection([el], el);
    return;
  }
  if (current === el) return;
  // A re-resolved object with the same source-site identity keeps the current selection and hierarchy step.
  if (el && current
    && current.cid === el.cid
    && current.src === el.src
    && current.domElement === el.domElement) {
    if (!sameResolvedMetadata(current, el)) {
      currentSelection = { elements: [el], primary: el };
      notify();
    }
    return;
  }
  currentSelection = { elements: [el], primary: el };
  chain = computeHierarchy(el.domElement);
  index = 0;
  notify();
}

function sameSelection(left: Selection | null, right: Selection | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.primary.domElement !== right.primary.domElement) return false;
  if (left.elements.length !== right.elements.length) return false;
  return left.elements.every((element, elementIndex) => {
    const candidate = right.elements[elementIndex];
    return candidate
      && candidate.domElement === element.domElement
      && candidate.cid === element.cid
      && candidate.src === element.src
      && sameResolvedMetadata(candidate, element);
  });
}

function publishSelection(elements: readonly SelectedElement[], primary: SelectedElement): void {
  const unique: SelectedElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const element of elements) {
    if (seen.has(element.domElement)) continue;
    seen.add(element.domElement);
    unique.push(element);
  }
  if (unique.length === 0) {
    setSelectedElement(null);
    return;
  }
  const nextPrimary = unique.find((element) => element.domElement === primary.domElement) ?? unique.at(-1)!;
  const next: Selection = { elements: unique, primary: nextPrimary };
  if (sameSelection(currentSelection, next)) return;
  currentSelection = next;
  if (unique.length === 1) {
    chain = computeHierarchy(nextPrimary.domElement);
    index = 0;
  } else {
    // Hierarchy stepping is a single-element operation; a stale parent chain must not render for a group.
    chain = [];
    index = 0;
  }
  notify();
}

export function setSelectedElements(elements: readonly SelectedElement[]): void {
  const primary = elements.at(-1);
  if (!primary) {
    setSelectedElement(null);
    return;
  }
  publishSelection(elements, primary);
}

/** Adds or removes one target while keeping the toggled target primary. */
export function toggleSelectedElement(el: SelectedElement): void {
  const selectedElements = getSelectedElements();
  // Page styles are edited alone; grouping them would offer box and structure editors.
  if (isPageTarget(el.domElement) || selectedElements.some((selected) => isPageTarget(selected.domElement))) {
    setSelectedElement(el);
    return;
  }
  const existingIndex = selectedElements.findIndex((selected) => selected.domElement === el.domElement);
  if (existingIndex >= 0) {
    const remaining = selectedElements.filter((_, index) => index !== existingIndex);
    if (remaining.length === 0) {
      setSelectedElement(null);
      return;
    }
    const primary = remaining.at(-1)!;
    publishSelection(remaining, primary);
    return;
  }
  publishSelection([...selectedElements, el], el);
}

export function removeSelectedElement(el: HTMLElement): void {
  const selectedElements = getSelectedElements();
  const remaining = selectedElements.filter((selected) => selected.domElement !== el);
  if (remaining.length === selectedElements.length) return;
  if (remaining.length === 0) {
    setSelectedElement(null);
    return;
  }
  const primary = currentSelection?.primary.domElement === el
    ? remaining.at(-1)!
    : currentSelection?.primary ?? remaining.at(-1)!;
  publishSelection(remaining, primary);
}

/** Refreshes metadata for one selected DOM node without collapsing a group. */
export function refreshSelectedElement(el: SelectedElement): void {
  const selectedElements = getSelectedElements();
  const targetIndex = selectedElements.findIndex((selected) => selected.domElement === el.domElement);
  if (targetIndex < 0) {
    setSelectedElement(el);
    return;
  }
  const refreshed = selectedElements.slice();
  refreshed[targetIndex] = el;
  const primary = currentSelection?.primary.domElement === el.domElement
    ? el
    : currentSelection?.primary ?? el;
  publishSelection(refreshed, primary);
}

function applyStep(newIndex: number): void {
  if (newIndex < 0 || newIndex >= chain.length) return;
  if (newIndex === index) return;
  index = newIndex;
  const node = chain[index];
  if (node) {
    const resolved = resolveSelectionFromElement(node);
    if (resolved) currentSelection = { elements: [resolved], primary: resolved };
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

export {
  subscribe,
  getSelectedElement,
  getSelectedElements,
  getSelection,
  getHierarchy,
  getHierarchyIndex,
};

export function useSelectedElement(): SelectedElement | null {
  return useSyncExternalStore(subscribe, getSelectedElement, getSelectedElement);
}

export function useSelectedElements(): readonly SelectedElement[] {
  return useSyncExternalStore(subscribe, getSelectedElements, getSelectedElements);
}

export function useSelection(): Selection | null {
  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

export function useHierarchy(): HTMLElement[] {
  return useSyncExternalStore(subscribe, getHierarchy, getHierarchy);
}

export function useHierarchyIndex(): number {
  return useSyncExternalStore(subscribe, getHierarchyIndex, getHierarchyIndex);
}
