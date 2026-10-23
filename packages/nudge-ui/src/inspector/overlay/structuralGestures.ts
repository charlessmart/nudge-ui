import type { SelectedElement } from "../selection/selectionStore.ts";
import {
  applyStructuralProjection,
  canContainElement as canContainStructuralElement,
  createStructuralDelete,
  createStructuralMove,
  getStructuralMoveLegality,
  getStructuralChanges,
  type StructuralDelete,
  type StructuralMove,
} from "../projection/structuralProjection.ts";
import { isEditorShellDocument } from "../runtime/editorShell.ts";
import { isPageTarget } from "../selection/pageTarget.ts";

export type StructuralNudgeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Temporary, document-local insertion point; canonical moves capture durable rendered-instance refs instead. */
export interface DropLocation {
  parent: HTMLElement;
  before: Node | null;
  orientation: "horizontal" | "vertical";
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Why a release produced no move, phrased as a one-line message for the user. */
export interface DropRejection {
  message: string;
}

export interface DropAttempt {
  drop: DropLocation | null;
  /** Null when there is nothing worth explaining, such as releasing over the dragged element or its current slot. */
  rejection: DropRejection | null;
}

type DropCheck = { ok: true } | { ok: false; rejection: DropRejection | null };

/** Canonical moves address elements by source site, so every participant needs one. */
function untrackedParticipant(elements: readonly (HTMLElement | null)[]): HTMLElement | null {
  return elements.find((element) => element && !element.getAttribute("data-cid")) ?? null;
}

function describeIllegalDrop(parent: HTMLElement): DropRejection | null {
  const display = parent.ownerDocument.defaultView?.getComputedStyle(parent).display;
  if (display === "inline") return { message: "Can't drop into an inline element" };
  return null;
}

function checkDrop(dragged: HTMLElement, parent: HTMLElement, before: Node | null): DropCheck {
  const legality = getStructuralMoveLegality(dragged, { parent, before });
  if (!legality.valid) return { ok: false, rejection: describeIllegalDrop(parent) };
  const untracked = untrackedParticipant([dragged, legality.sourceParent, parent, legality.before]);
  if (!untracked) return { ok: true };
  return {
    ok: false,
    rejection: {
      message: untracked === parent || untracked === legality.before
        ? "Can't drop here: this element isn't traced to your source"
        : "Can't move this element: its parent isn't traced to your source",
    },
  };
}

/** Delegates to the guard shared with canonical capture and document replay. */
export function canContainElement(parent: HTMLElement, child: HTMLElement): boolean {
  return canContainStructuralElement(parent, child);
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
}

interface FlexItem {
  element: HTMLElement;
  rect: DOMRect;
}

interface FlexLine {
  top: number;
  bottom: number;
  items: FlexItem[];
}

function rightOf(rect: Box): number {
  return rect.right !== undefined && Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
}

function bottomOf(rect: Box): number {
  return rect.bottom !== undefined && Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
}

function isDisplayContents(element: HTMLElement): boolean {
  return element.ownerDocument.defaultView?.getComputedStyle(element).display === "contents";
}

/** A display: contents element generates no box, so its children are laid out by the nearest boxed ancestor. */
function layoutParent(element: HTMLElement): HTMLElement {
  let current = element;
  while (isDisplayContents(current) && current.parentElement) current = current.parentElement;
  return current;
}

/** Boxes laid out directly by `container`, looking through display: contents wrappers to their children. */
function layoutItems(container: HTMLElement): FlexItem[] {
  const HTMLElementConstructor = container.ownerDocument.defaultView!.HTMLElement;
  return Array.from(container.children).flatMap((child): FlexItem[] => {
    if (!(child instanceof HTMLElementConstructor)) return [];
    return isDisplayContents(child) ? layoutItems(child) : [{ element: child, rect: child.getBoundingClientRect() }];
  });
}

/** The area a drop into `parent` targets; a display: contents parent spans its children because it has no box of its own. */
export function dropTargetRect(parent: HTMLElement): Box {
  if (!isDisplayContents(parent)) return parent.getBoundingClientRect();
  const rects = layoutItems(parent).map((item) => item.rect).filter((rect) => rect.width > 0 || rect.height > 0);
  if (rects.length === 0) return layoutParent(parent).getBoundingClientRect();
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map(rightOf));
  const bottom = Math.max(...rects.map(bottomOf));
  return { left, top, width: right - left, height: bottom - top, right, bottom };
}

function isFlexRow(parent: HTMLElement): boolean {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(layoutParent(parent));
  return (style?.display === "flex" || style?.display === "inline-flex")
    && (style.flexDirection || "row").startsWith("row");
}

function isFlexRowReverse(parent: HTMLElement): boolean {
  return parent.ownerDocument.defaultView?.getComputedStyle(layoutParent(parent)).flexDirection === "row-reverse";
}

function isWrappedFlexRow(parent: HTMLElement): boolean {
  const flexWrap = parent.ownerDocument.defaultView?.getComputedStyle(layoutParent(parent)).flexWrap;
  return isFlexRow(parent) && Boolean(flexWrap && flexWrap !== "nowrap");
}

/** Visual lines of a wrapped flex row, grouped by vertical overlap so `order` and `wrap-reverse` need no special case. */
function flexLines(parent: HTMLElement): FlexLine[] {
  const lines: FlexLine[] = [];
  for (const { element: child, rect } of layoutItems(layoutParent(parent))) {
    if (rect.width === 0 && rect.height === 0) continue;
    const bottom = bottomOf(rect);
    const line = lines.find((candidate) => rect.top < candidate.bottom && bottom > candidate.top);
    if (line) {
      line.items.push({ element: child, rect });
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      lines.push({ top: rect.top, bottom, items: [{ element: child, rect }] });
    }
  }
  return lines;
}

function flexLineNearest(lines: readonly FlexLine[], y: number): FlexLine | null {
  let nearest: FlexLine | null = null;
  let nearestDistance = Infinity;
  for (const line of lines) {
    const distance = y < line.top ? line.top - y : y > line.bottom ? y - line.bottom : 0;
    if (distance < nearestDistance) {
      nearest = line;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** `span` limits a vertical guide to one line of a wrapped row instead of the whole container. */
function lineFor(
  parent: HTMLElement,
  before: Node | null,
  flexGapCentre?: number,
  span?: Pick<FlexLine, "top" | "bottom">,
): Pick<DropLocation, "orientation" | "left" | "top" | "width" | "height"> {
  // A flex row's guide sits in the row's own box, which a display: contents parent shares with its siblings.
  const parentRect = isFlexRow(parent) ? layoutParent(parent).getBoundingClientRect() : dropTargetRect(parent);
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
    const top = span?.top ?? parentRect.top;
    const height = span ? span.bottom - span.top : parentRect.height;
    const verticalInset = span ? 0 : Math.min(8, Math.max(2, height / 12));
    return {
      orientation: "vertical",
      left: Math.max(parentRect.left + 2, Math.min(intendedLeft, parentRight - 2)),
      top: top + verticalInset,
      width: 4,
      height: Math.max(0, height - verticalInset * 2),
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

/** Items may belong to a display: contents child of `parent`, so the drop parent is the anchor item's own parent. */
function flexRowGapAtPoint(parent: HTMLElement, dragged: HTMLElement, x: number, y: number): DropLocation | null {
  const parentRect = parent.getBoundingClientRect();
  if (y < parentRect.top || y > bottomOf(parentRect)) return null;
  const wrapped = isWrappedFlexRow(parent);
  const line = wrapped ? flexLineNearest(flexLines(parent), y) : null;
  if (wrapped && !line) return null;
  let left: FlexItem | null = null;
  let right: FlexItem | null = null;
  for (const item of line?.items ?? layoutItems(parent)) {
    if (rightOf(item.rect) <= x && (!left || rightOf(item.rect) > rightOf(left.rect))) left = item;
    if (item.rect.left >= x && (!right || item.rect.left < right.rect.left)) right = item;
  }
  const reverse = isFlexRowReverse(parent);
  let anchor: HTMLElement;
  let afterAnchor: boolean;
  let centre: number;
  if (left && right) {
    const gapStart = rightOf(left.rect);
    const gapEnd = right.rect.left;
    if (gapEnd - gapStart < 4) return null;
    anchor = reverse ? left.element : right.element;
    afterAnchor = false;
    centre = (gapStart + gapEnd) / 2;
  } else if (line && left) {
    // Past the end of a wrapped line: after its last item, which may be the next line's first in DOM order.
    anchor = left.element;
    afterAnchor = !reverse;
    centre = rightOf(left.rect);
  } else if (line && right) {
    anchor = right.element;
    afterAnchor = reverse;
    centre = right.rect.left;
  } else {
    return null;
  }
  const dropParent = anchor.parentElement;
  const before = afterAnchor ? anchor.nextElementSibling : anchor;
  if (!dropParent || !checkDrop(dragged, dropParent, before).ok) return null;
  return { parent: dropParent, before, ...lineFor(dropParent, before, centre, line ?? undefined) };
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

const NO_DROP: DropAttempt = { drop: null, rejection: null };

function dropAttemptForElement(
  dragged: HTMLElement,
  target: HTMLElement,
  beforeTarget: boolean,
  preferContainer: boolean,
): DropAttempt {
  if (target === dragged || dragged.contains(target)) return NO_DROP;
  if (preferContainer && !Array.from(target.children).some((child) => child.contains(dragged))
    && checkDrop(dragged, target, null).ok) {
    return { drop: { parent: target, before: null, ...lineFor(target, null) }, rejection: null };
  }
  let candidate: HTMLElement | null = target;
  while (candidate) {
    const parent: HTMLElement | null = candidate.parentElement;
    if (parent && canContainElement(parent, dragged) && candidate !== dragged && !dragged.contains(candidate)) {
      const before = beforeTarget ? candidate : candidate.nextElementSibling;
      const check = checkDrop(dragged, parent, before);
      if (check.ok) return { drop: { parent, before, ...lineFor(parent, before) }, rejection: null };
      return { drop: null, rejection: check.rejection };
    }
    candidate = parent;
  }
  return NO_DROP;
}

export function getDropLocationForElement(
  dragged: HTMLElement,
  target: HTMLElement,
  beforeTarget: boolean,
  preferContainer = true,
): DropLocation | null {
  return dropAttemptForElement(dragged, target, beforeTarget, preferContainer).drop;
}

/** SVG and MathML descendants are not HTML containers, so they drop relative to their nearest HTML ancestor. */
function htmlElementAtPoint(doc: Document, x: number, y: number): HTMLElement | null {
  const HTMLElementConstructor = doc.defaultView!.HTMLElement;
  let element = doc.elementFromPoint(x, y);
  while (element && !(element instanceof HTMLElementConstructor)) element = element.parentElement;
  return element;
}

export function getDropAttemptAtPoint(doc: Document, dragged: HTMLElement, x: number, y: number): DropAttempt {
  const target = htmlElementAtPoint(doc, x, y);
  if (!target) return NO_DROP;
  if (isFlexRow(target)) {
    const gapDrop = flexRowGapAtPoint(target, dragged, x, y);
    if (gapDrop) return { drop: gapDrop, rejection: null };
  }
  const flexRowChild = flexRowChildAtTarget(dragged, target);
  if (flexRowChild) {
    const parent = flexRowChild.parentElement!;
    const rect = flexRowChild.getBoundingClientRect();
    const reverse = isFlexRowReverse(parent);
    const beforeChild = reverse ? x > rect.left + rect.width / 2 : x < rect.left + rect.width / 2;
    const attempt = dropAttemptForElement(dragged, flexRowChild, beforeChild, false);
    if (!attempt.drop || !isWrappedFlexRow(parent)) return attempt;
    // The DOM neighbour after a line's last item sits on the next line, so draw the guide beside the hovered item.
    const line = flexLines(parent).find((candidate) => candidate.items.some((item) => item.element === flexRowChild));
    const edge = beforeChild !== reverse ? rect.left : rightOf(rect);
    return { drop: { ...attempt.drop, ...lineFor(parent, attempt.drop.before, edge, line) }, rejection: null };
  }
  const rect = target.getBoundingClientRect();
  const edgeBand = Math.min(24, Math.max(8, rect.height * 0.3));
  const inContainerInterior = y - rect.top > edgeBand && y - rect.top < rect.height - edgeBand;
  return dropAttemptForElement(dragged, target, y < rect.top + rect.height / 2, inContainerInterior);
}

export function getDropLocationAtPoint(doc: Document, dragged: HTMLElement, x: number, y: number): DropLocation | null {
  return getDropAttemptAtPoint(doc, dragged, x, y).drop;
}

function projectInlineHost(node: HTMLElement): void {
  if (node.ownerDocument !== document || isEditorShellDocument(document)) return;
  applyStructuralProjection(document, getStructuralChanges());
}

export function moveElement(node: HTMLElement, destination: DropLocation): StructuralMove | null {
  if (isPageTarget(node)) return null;
  if (!getStructuralMoveLegality(node, destination).valid) return null;
  const change = createStructuralMove(node, destination);
  if (change) projectInlineHost(node);
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

export function deleteElement(selected: SelectedElement): StructuralDelete | null {
  const node = selected.domElement;
  if (isPageTarget(node) || !node.parentElement || !node.isConnected) return null;
  const change = createStructuralDelete(node);
  if (change) projectInlineHost(node);
  return change;
}
