import type { SelectedElement } from "./selectionStore.ts";
import {
  applyStructuralProjection,
  canContainElement as canContainStructuralElement,
  createStructuralDelete,
  createStructuralMove,
  getStructuralMoveLegality,
  getStructuralChanges,
  type StructuralDelete,
  type StructuralMove,
} from "./structuralProjection.ts";

export type StructuralNudgeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/**
 * A temporary, document-local insertion point. It is intentionally not a
 * structural record: `moveElement` captures durable rendered-instance refs
 * before handing the canonical action to structuralProjection.
 */
export interface DropLocation {
  parent: HTMLElement;
  before: Node | null;
  orientation: "horizontal" | "vertical";
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Conservative HTML guard shared with canonical capture and document replay. */
export function canContainElement(parent: HTMLElement, child: HTMLElement): boolean {
  return canContainStructuralElement(parent, child);
}

function isContainerCandidate(element: HTMLElement, dragged: HTMLElement): boolean {
  return getStructuralMoveLegality(dragged, { parent: element, before: null }).valid;
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
  // SAFETY: before.nodeType === 1 was checked above, so it is an HTMLElement.
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
  return {
    orientation: "horizontal",
    left: parentRect.left + horizontalInset,
    top: Math.max(parentRect.top + 4, Math.min(intendedTop, parentBottom - 4)),
    width: Math.max(0, parentRect.width - horizontalInset * 2),
    height: 4,
  };
}

function flexRowGapAtPoint(parent: HTMLElement, dragged: HTMLElement, x: number, y: number): DropLocation | null {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
  if ((style?.flexWrap && style.flexWrap !== "nowrap") || !canContainElement(parent, dragged)) return null;
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
  const before = isFlexRowReverse(parent) ? left.element : right.element;
  if (!getStructuralMoveLegality(dragged, { parent, before }).valid) return null;
  return { parent, before, ...lineFor(parent, before, (gapStart + gapEnd) / 2) };
}

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

/** Derives a safe insertion point; its nodes never leave this gesture module. */
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
      const legality = getStructuralMoveLegality(dragged, { parent: target, before: null });
      if (legality.valid) return { parent: target, before: null, ...lineFor(target, null) };
    }
  }
  let candidate: HTMLElement | null = target;
  while (candidate) {
    const parent: HTMLElement | null = candidate.parentElement;
    if (parent && canContainElement(parent, dragged) && candidate !== dragged && !dragged.contains(candidate)) {
      const before = beforeTarget ? candidate : candidate.nextElementSibling;
      const legality = getStructuralMoveLegality(dragged, { parent, before });
      if (legality.valid) return { parent, before, ...lineFor(parent, before) };
      return null;
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
    return getDropLocationForElement(dragged, flexRowChild, reverse ? x > rect.left + rect.width / 2 : x < rect.left + rect.width / 2, false);
  }
  const rect = target.getBoundingClientRect();
  const edgeBand = Math.min(24, Math.max(8, rect.height * 0.3));
  const inContainerInterior = y - rect.top > edgeBand && y - rect.top < rect.height - edgeBand;
  return getDropLocationForElement(dragged, target, y < rect.top + rect.height / 2, inContainerInterior);
}

/** Capture the move as canonical intent, then project only the controller host. */
export function moveElement(node: HTMLElement, destination: DropLocation): StructuralMove | null {
  if (!getStructuralMoveLegality(node, destination).valid) return null;
  const change = createStructuralMove(node, destination);
  if (!change) return null;
  // `document` belongs to the controller runtime. A Canvas source element is
  // deliberately not projected here; its renderer receives this snapshot once.
  applyStructuralProjection(document, getStructuralChanges());
  return change;
}

/** Reorder only same-parent siblings; horizontal movement needs a flex row. */
export function nudgeElement(node: HTMLElement, key: StructuralNudgeKey): StructuralMove | null {
  const parent = node.parentElement;
  if (!parent || !node.isConnected) return null;
  if ((key === "ArrowLeft" || key === "ArrowRight") && !isFlexRow(parent)) return null;
  const moveEarlier = key === "ArrowUp" || key === "ArrowLeft";
  const sibling = moveEarlier ? node.previousElementSibling : node.nextElementSibling;
  if (!sibling) return null;
  const before = moveEarlier ? sibling : sibling.nextElementSibling;
  return moveElement(node, { parent, before, ...lineFor(parent, before) });
}

/** Capture delete intent and project only the controller host. */
export function deleteElement(selected: SelectedElement): StructuralDelete | null {
  const node = selected.domElement;
  if (!node.parentElement || !node.isConnected) return null;
  const change = createStructuralDelete(node);
  if (!change) return null;
  applyStructuralProjection(document, getStructuralChanges());
  return change;
}
