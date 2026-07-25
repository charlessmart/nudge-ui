import { useSyncExternalStore } from "react";
import { getEditScope, getInstanceEvidence, selectorForElement } from "./editScope.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import type { SelectedElement } from "./selectionStore.ts";

export type DomMutationAction = "move" | "delete";
export type DomNudgeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface DomPosition {
  parentTag: string;
  index: number;
}

export interface DomMutationRecord {
  id: string;
  action: DomMutationAction;
  cid: string;
  file: string;
  line: number;
  selector: string;
  source: { file: string; line: number; component: string };
  from: DomPosition;
  to?: DomPosition;
  outerHTML: string;
  scope: "source-site" | "instance-preview";
  instanceEvidence?: { renderedIndex: number; props: string | null; text: string | null };
  stale: boolean;
}

interface LiveMutation {
  record: DomMutationRecord;
  node: HTMLElement;
  fromParent: HTMLElement;
  fromNextSibling: Node | null;
  toParent?: HTMLElement;
  toNextSibling?: Node | null;
  placeholder?: Comment;
  observer?: MutationObserver;
}

export interface DropLocation {
  parent: HTMLElement;
  before: Node | null;
  orientation: "horizontal" | "vertical";
  left: number;
  top: number;
  width: number;
  height: number;
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const PHRASING_PARENTS = new Set(["a", "abbr", "b", "button", "cite", "code", "em", "label", "mark", "p", "small", "span", "strong", "time"]);
const PHRASING_CHILDREN = new Set(["a", "abbr", "b", "br", "button", "cite", "code", "em", "img", "input", "label", "mark", "small", "span", "strong", "time"]);

let nextId = 1;
let liveMutations: LiveMutation[] = [];
let currentSnapshot: DomMutationRecord[] = [];
let undoStack: LiveMutation[] = [];
let redoStack: LiveMutation[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): DomMutationRecord[] {
  return currentSnapshot;
}

function refreshSnapshot(): void {
  currentSnapshot = liveMutations.map(({ record }) => ({ ...record }));
}

function elementIndex(element: HTMLElement): number {
  return Array.from(element.parentElement?.children ?? []).indexOf(element);
}

function positionFor(element: HTMLElement): DomPosition {
  return { parentTag: element.parentElement?.tagName.toLowerCase() ?? "unknown", index: elementIndex(element) };
}

function isPhrasingElement(element: HTMLElement): boolean {
  return PHRASING_CHILDREN.has(element.tagName.toLowerCase());
}

/** Conservative HTML guard. It deliberately rejects a block element in text-only parents. */
export function canContainElement(parent: HTMLElement, child: HTMLElement): boolean {
  const parentTag = parent.tagName.toLowerCase();
  if (VOID_TAGS.has(parentTag) || parent === child || child.contains(parent)) return false;
  return !PHRASING_PARENTS.has(parentTag) || isPhrasingElement(child);
}

function isContainerCandidate(element: HTMLElement, dragged: HTMLElement): boolean {
  if (!canContainElement(element, dragged)) return false;
  const display = element.ownerDocument.defaultView?.getComputedStyle(element).display ?? "block";
  return display !== "inline" && display !== "contents";
}

function isFlexRow(parent: HTMLElement): boolean {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  return (style?.display === "flex" || style?.display === "inline-flex")
    && (style.flexDirection || "row").startsWith("row");
}

function isFlexRowReverse(parent: HTMLElement): boolean {
  return parent.ownerDocument.defaultView?.getComputedStyle(parent).flexDirection === "row-reverse";
}

function rightOf(rect: DOMRect): number {
  return Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
}

function bottomOf(rect: DOMRect): number {
  return Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
}

function lineFor(
  parent: HTMLElement,
  before: Node | null,
  flexGapCentre?: number,
): Pick<DropLocation, "orientation" | "left" | "top" | "width" | "height"> {
  const parentRect = parent.getBoundingClientRect();
  const beforeElement = before?.nodeType === 1 ? before as HTMLElement : null;
  const reference = beforeElement ?? parent.lastElementChild;
  const referenceRect = reference?.getBoundingClientRect();
  const parentRight = rightOf(parentRect);
  const parentBottom = bottomOf(parentRect);
  const horizontalInset = Math.min(8, Math.max(2, parentRect.width / 12));

  if (isFlexRow(parent)) {
    const reverse = isFlexRowReverse(parent);
    const intendedLeft = flexGapCentre ?? (beforeElement
      ? (reverse ? rightOf(referenceRect ?? parentRect) : referenceRect?.left ?? parentRect.left)
      : (reverse ? referenceRect?.left ?? parentRect.left : rightOf(referenceRect ?? parentRect)));
    const verticalInset = Math.min(8, Math.max(2, parentRect.height / 12));
    return {
      orientation: "vertical",
      left: Math.max(parentRect.left + 2, Math.min(intendedLeft, parentRight - 2)),
      top: parentRect.top + verticalInset,
      width: 4,
      height: Math.max(0, parentRect.height - verticalInset * 2),
    };
  }

  const intendedTop = beforeElement
    ? referenceRect?.top ?? parentRect.top
    : referenceRect ? bottomOf(referenceRect) : parentRect.top + 8;

  // Keep the guide inside its destination container. This makes an append
  // target read as "drop into this div" rather than a page-wide separator.
  return {
    orientation: "horizontal",
    left: parentRect.left + horizontalInset,
    top: Math.max(parentRect.top + 4, Math.min(intendedTop, parentBottom - 4)),
    width: Math.max(0, parentRect.width - horizontalInset * 2),
    height: 4,
  };
}

/**
 * Finds the visual gap under a pointer in a single-line flex row. We only read
 * direct child rects when the pointer is over the row itself (the usual result
 * of hit-testing a real CSS gap), and the caller is already frame-throttled.
 */
function flexRowGapAtPoint(
  parent: HTMLElement,
  dragged: HTMLElement,
  x: number,
  y: number,
): DropLocation | null {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  if (style?.flexWrap && style.flexWrap !== "nowrap" || !canContainElement(parent, dragged)) return null;

  const parentRect = parent.getBoundingClientRect();
  if (y < parentRect.top || y > bottomOf(parentRect)) return null;
  let left: { element: HTMLElement; rect: DOMRect } | null = null;
  let right: { element: HTMLElement; rect: DOMRect } | null = null;
  const HTMLElementConstructor = parent.ownerDocument.defaultView!.HTMLElement;
  for (const child of Array.from(parent.children)) {
    if (!(child instanceof HTMLElementConstructor)) continue;
    const rect = child.getBoundingClientRect();
    if (rightOf(rect) <= x && (!left || rightOf(rect) > rightOf(left.rect))) left = { element: child, rect };
    if (rect.left >= x && (!right || rect.left < right.rect.left)) right = { element: child, rect };
  }
  if (!left || !right) return null;

  const gapStart = rightOf(left.rect);
  const gapEnd = right.rect.left;
  if (gapEnd - gapStart < 4) return null;

  // DOM order runs in the opposite direction for row-reverse.
  const before = isFlexRowReverse(parent) ? left.element : right.element;
  const line = lineFor(parent, before, (gapStart + gapEnd) / 2);
  return { parent, before, ...line };
}

/** Finds the direct flex-row child under a pointer, even when it hit nested content. */
function flexRowChildAtTarget(dragged: HTMLElement, target: HTMLElement): HTMLElement | null {
  let child: HTMLElement | null = target;
  while (child?.parentElement) {
    const parent: HTMLElement = child.parentElement;
    if (isFlexRow(parent) && canContainElement(parent, dragged)
      && child !== dragged && !dragged.contains(child)) return child;
    child = parent;
  }
  return null;
}

/**
 * Derives a safe insertion point from the element currently under the pointer.
 * Containers accept an append drop; otherwise the closest legal sibling gets a
 * before/after insertion line. The returned values are document-local and are
 * never used as a persistent identity.
 */
export function getDropLocationForElement(
  dragged: HTMLElement,
  target: HTMLElement,
  beforeTarget: boolean,
  preferContainer = true,
): DropLocation | null {
  if (target === dragged || dragged.contains(target)) return null;

  if (preferContainer && isContainerCandidate(target, dragged)) {
    const directChild = Array.from(target.children).find((child) => child.contains(dragged));
    if (!directChild) {
      const line = lineFor(target, null);
      return { parent: target, before: null, ...line };
    }
  }

  let candidate: HTMLElement | null = target;
  while (candidate) {
    const parent: HTMLElement | null = candidate.parentElement;
    if (parent && canContainElement(parent, dragged) && candidate !== dragged && !dragged.contains(candidate)) {
      const before = beforeTarget ? candidate : candidate.nextSibling;
      const line = lineFor(parent, before);
      return { parent, before, ...line };
    }
    candidate = parent;
  }
  return null;
}

export function getDropLocationAtPoint(doc: Document, dragged: HTMLElement, x: number, y: number): DropLocation | null {
  const target = doc.elementFromPoint(x, y);
  if (!(target instanceof doc.defaultView!.HTMLElement)) return null;
  if (isFlexRow(target)) {
    const gapDrop = flexRowGapAtPoint(target, dragged, x, y);
    if (gapDrop) return gapDrop;
  }
  const flexRowChild = flexRowChildAtTarget(dragged, target);
  if (flexRowChild) {
    const rect = flexRowChild.getBoundingClientRect();
    const reverse = isFlexRowReverse(flexRowChild.parentElement!);
    const beforeTarget = reverse ? x > rect.left + rect.width / 2 : x < rect.left + rect.width / 2;
    return getDropLocationForElement(dragged, flexRowChild, beforeTarget, false);
  }
  const rect = target.getBoundingClientRect();
  const relativeY = y - rect.top;
  const edgeBand = Math.min(24, Math.max(8, rect.height * 0.3));
  const inContainerInterior = relativeY > edgeBand && relativeY < rect.height - edgeBand;
  return getDropLocationForElement(
    dragged,
    target,
    y < rect.top + rect.height / 2,
    inContainerInterior,
  );
}

function createRecord(action: DomMutationAction, node: HTMLElement, from: DomPosition, to?: DomPosition): DomMutationRecord | null {
  const selected = resolveSelectionFromElement(node);
  const selector = selectorForElement(node);
  if (!selected || !selector) return null;
  const scope = getEditScope(node);
  return {
    id: `dom-${nextId++}`,
    action,
    cid: selected.cid,
    file: selected.file,
    line: selected.line,
    selector,
    source: { file: selected.file, line: selected.line, component: selected.cid },
    from,
    to,
    outerHTML: node.outerHTML,
    scope,
    instanceEvidence: scope === "instance-preview" ? getInstanceEvidence(node) : undefined,
    stale: false,
  };
}

function observeForSnapBack(mutation: LiveMutation): void {
  const Observer = mutation.node.ownerDocument.defaultView?.MutationObserver;
  if (!Observer) return;
  mutation.observer = new Observer(() => {
    if (mutation.node.isConnected || mutation.record.stale) return;
    mutation.record.stale = true;
    refreshSnapshot();
    notify();
  });
  mutation.observer.observe(mutation.node.ownerDocument.documentElement, { childList: true, subtree: true });
}

function applyLiveMutation(mutation: LiveMutation): void {
  if (mutation.record.action === "move") {
    mutation.toParent?.insertBefore(mutation.node, mutation.toNextSibling ?? null);
    return;
  }
  if (!mutation.placeholder) mutation.placeholder = mutation.node.ownerDocument.createComment("design-tool-deleted");
  mutation.node.replaceWith(mutation.placeholder);
}

function undoLiveMutation(mutation: LiveMutation): void {
  if (mutation.record.action === "move") {
    mutation.fromParent.insertBefore(mutation.node, mutation.fromNextSibling);
    return;
  }
  mutation.placeholder?.replaceWith(mutation.node);
}

function commit(mutation: LiveMutation): DomMutationRecord {
  liveMutations = [...liveMutations, mutation];
  refreshSnapshot();
  undoStack = [...undoStack, mutation];
  redoStack = [];
  observeForSnapBack(mutation);
  notify();
  return mutation.record;
}

export function moveElement(node: HTMLElement, destination: DropLocation): DomMutationRecord | null {
  const parent = node.parentElement;
  if (!parent || destination.parent === node || node.contains(destination.parent)) return null;
  const from = positionFor(node);
  const beforeElement = destination.before?.nodeType === 1 ? destination.before as HTMLElement : null;
  const to = { parentTag: destination.parent.tagName.toLowerCase(), index: beforeElement
    ? Array.from(destination.parent.children).indexOf(beforeElement)
    : destination.parent.children.length };
  const record = createRecord("move", node, from, to);
  if (!record) return null;
  const mutation: LiveMutation = {
    record,
    node,
    fromParent: parent,
    fromNextSibling: node.nextSibling,
    toParent: destination.parent,
    toNextSibling: destination.before,
  };
  applyLiveMutation(mutation);
  return commit(mutation);
}

/** Reorders a node amongst its element siblings without bypassing mutation recording. */
export function nudgeElement(node: HTMLElement, key: DomNudgeKey): DomMutationRecord | null {
  const parent = node.parentElement;
  if (!parent || !node.isConnected) return null;

  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  if (horizontal) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(parent);
    const isFlexRow = (style?.display === "flex" || style?.display === "inline-flex")
      && style.flexDirection.startsWith("row");
    if (!isFlexRow) return null;
  }

  const moveEarlier = key === "ArrowUp" || key === "ArrowLeft";
  const sibling = moveEarlier ? node.previousElementSibling : node.nextElementSibling;
  if (!sibling) return null;
  const siblingElement = sibling as HTMLElement;
  const before = moveEarlier ? siblingElement : siblingElement.nextElementSibling;
  const line = lineFor(parent, before);
  return moveElement(node, { parent, before, ...line });
}

export function deleteElement(selected: SelectedElement): DomMutationRecord | null {
  const node = selected.domElement;
  const parent = node.parentElement;
  if (!parent || !node.isConnected) return null;
  const record = createRecord("delete", node, positionFor(node));
  if (!record) return null;
  const mutation: LiveMutation = {
    record,
    node,
    fromParent: parent,
    fromNextSibling: node.nextSibling,
  };
  applyLiveMutation(mutation);
  return commit(mutation);
}

export function revertDomMutation(record: DomMutationRecord): void {
  const mutation = liveMutations.find((candidate) => candidate.record.id === record.id);
  if (!mutation) return;
  undoLiveMutation(mutation);
  mutation.observer?.disconnect();
  liveMutations = liveMutations.filter((candidate) => candidate !== mutation);
  refreshSnapshot();
  undoStack = undoStack.filter((candidate) => candidate !== mutation);
  redoStack = redoStack.filter((candidate) => candidate !== mutation);
  notify();
}

export function undoDomMutation(): boolean {
  const mutation = undoStack.at(-1);
  if (!mutation) return false;
  undoStack = undoStack.slice(0, -1);
  undoLiveMutation(mutation);
  redoStack = [...redoStack, mutation];
  notify();
  return true;
}

export function redoDomMutation(): boolean {
  const mutation = redoStack.at(-1);
  if (!mutation) return false;
  redoStack = redoStack.slice(0, -1);
  applyLiveMutation(mutation);
  undoStack = [...undoStack, mutation];
  notify();
  return true;
}

export function clearDomMutations(revert = false): void {
  if (revert) {
    [...liveMutations].reverse().forEach((mutation) => undoLiveMutation(mutation));
  }
  liveMutations.forEach((mutation) => mutation.observer?.disconnect());
  liveMutations = [];
  refreshSnapshot();
  undoStack = [];
  redoStack = [];
  notify();
}

export function useDomMutations(): DomMutationRecord[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export { subscribe as subscribeDomMutations, snapshot as getDomMutations };
