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
import { resolveSelectionTarget } from "../selection/selectionTarget.ts";

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

type Axis = "x" | "y";

/** The direction a container lays out its children, read from its nearest boxed ancestor. */
interface Flow {
  axis: Axis;
  reverse: boolean;
  wrapped: boolean;
}

function flowOf(parent: HTMLElement): Flow {
  const style = parent.ownerDocument.defaultView?.getComputedStyle(layoutParent(parent));
  const flex = style?.display === "flex" || style?.display === "inline-flex";
  const direction = style?.flexDirection || "row";
  if (flex && direction.startsWith("row")) {
    return { axis: "x", reverse: direction === "row-reverse", wrapped: Boolean(style?.flexWrap && style.flexWrap !== "nowrap") };
  }
  return { axis: "y", reverse: flex && direction === "column-reverse", wrapped: false };
}

function isFlexRow(parent: HTMLElement): boolean {
  return flowOf(parent).axis === "x";
}

function startOf(rect: Box, axis: Axis): number {
  return axis === "x" ? rect.left : rect.top;
}

function endOf(rect: Box, axis: Axis): number {
  return axis === "x" ? rightOf(rect) : bottomOf(rect);
}

function hasBox(rect: Box): boolean {
  return rect.width > 0 || rect.height > 0;
}

/** Visual lines of a wrapped flex row, grouped by vertical overlap so `order` and `wrap-reverse` need no special case. */
function flexLines(parent: HTMLElement): FlexLine[] {
  const lines: FlexLine[] = [];
  for (const { element: child, rect } of layoutItems(layoutParent(parent))) {
    if (!hasBox(rect)) continue;
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

/**
 * `centre` places the guide along the parent's axis, such as the middle of a gap; `span` limits a vertical guide to
 * one line of a wrapped row instead of the whole container.
 */
function lineFor(
  parent: HTMLElement,
  before: Node | null,
  centre?: number,
  span?: Pick<FlexLine, "top" | "bottom">,
): Pick<DropLocation, "orientation" | "left" | "top" | "width" | "height"> {
  const { axis, reverse } = flowOf(parent);
  // A flex row's guide sits in the row's own box, which a display: contents parent shares with its siblings.
  const parentRect = axis === "x" ? layoutParent(parent).getBoundingClientRect() : dropTargetRect(parent);
  // SAFETY: before.nodeType === 1 was checked above, so it is an HTMLElement.
  const beforeElement = before?.nodeType === 1 ? before as HTMLElement : null;
  const reference = beforeElement ?? parent.lastElementChild;
  const referenceRect = reference?.getBoundingClientRect();
  const parentRight = rightOf(parentRect);
  const parentBottom = bottomOf(parentRect);
  const horizontalInset = Math.min(8, Math.max(2, parentRect.width / 12));

  if (axis === "x") {
    const intendedLeft = centre ?? (beforeElement
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

  const intendedTop = centre ?? (beforeElement
    ? (reverse ? bottomOf(referenceRect ?? parentRect) : referenceRect?.top ?? parentRect.top)
    : referenceRect ? (reverse ? referenceRect.top : bottomOf(referenceRect)) : parentRect.top + 8);
  return {
    orientation: "horizontal",
    left: parentRect.left + horizontalInset,
    top: Math.max(parentRect.top + 4, Math.min(intendedTop, parentBottom - 4)),
    width: Math.max(0, parentRect.width - horizontalInset * 2),
    height: 4,
  };
}

const NO_DROP: DropAttempt = { drop: null, rejection: null };

function attemptAt(
  dragged: HTMLElement,
  parent: HTMLElement,
  before: Node | null,
  centre?: number,
  span?: Pick<FlexLine, "top" | "bottom">,
): DropAttempt {
  // The dragged element still occupies its slot, so an insertion before it means the slot after it.
  const anchor = before === dragged ? dragged.nextElementSibling : before;
  const check = checkDrop(dragged, parent, anchor);
  if (!check.ok) return { drop: null, rejection: check.rejection };
  return { drop: { parent, before: anchor, ...lineFor(parent, anchor, centre, span) }, rejection: null };
}

/**
 * Inserts among `container`'s children at the pointer: between the two laid-out neighbours either side of it on the
 * container's axis, or at its start or end. Children of a display: contents child belong to that wrapper, so the drop
 * parent is the neighbour's own parent.
 */
function slotAtPoint(container: HTMLElement, dragged: HTMLElement, x: number, y: number): DropAttempt {
  const { axis, reverse, wrapped } = flowOf(container);
  const line = wrapped ? flexLineNearest(flexLines(container), y) : null;
  const items = (line?.items ?? layoutItems(container))
    .filter((item) => item.element !== dragged && hasBox(item.rect))
    .sort((left, right) => startOf(left.rect, axis) - startOf(right.rect, axis));
  if (items.length === 0) return attemptAt(dragged, container, null);
  const position = axis === "x" ? x : y;
  const nextIndex = items.findIndex((item) => (startOf(item.rect, axis) + endOf(item.rect, axis)) / 2 > position);
  const previous = nextIndex === -1 ? items.at(-1) : items[nextIndex - 1];
  const next = nextIndex === -1 ? undefined : items[nextIndex];
  const centre = previous && next
    ? (endOf(previous.rect, axis) + startOf(next.rect, axis)) / 2
    : next ? startOf(next.rect, axis) : endOf(previous!.rect, axis);
  // Visual order runs against DOM order in a reversed flow, so the DOM anchor is the visually earlier neighbour.
  const [anchor, afterAnchor] = reverse
    ? previous ? [previous.element, false] : [next!.element, true]
    : next ? [next.element, false] : [previous!.element, true];
  const parent = anchor.parentElement;
  if (!parent) return NO_DROP;
  return attemptAt(dragged, parent, afterAnchor ? anchor.nextElementSibling : anchor, centre, line ?? undefined);
}

/** Beside `element` in its nearest parent that may hold the dragged element, on the side of the pointer along that parent's axis. */
function besideAtPoint(element: HTMLElement, dragged: HTMLElement, x: number, y: number): DropAttempt {
  let candidate: HTMLElement | null = element;
  while (candidate) {
    const parent: HTMLElement | null = candidate.parentElement;
    if (parent && canContainElement(parent, dragged) && candidate !== dragged && !dragged.contains(candidate)) {
      const { axis, reverse, wrapped } = flowOf(parent);
      const rect = candidate.getBoundingClientRect();
      const position = axis === "x" ? x : y;
      const beforeCandidate = (position < (startOf(rect, axis) + endOf(rect, axis)) / 2) !== reverse;
      const before = beforeCandidate ? candidate : candidate.nextElementSibling;
      if (!wrapped) return attemptAt(dragged, parent, before);
      // The DOM neighbour after a line's last item sits on the next line, so draw the guide beside the hovered item.
      const line = flexLines(parent).find((entry) => entry.items.some((item) => item.element === candidate));
      return attemptAt(dragged, parent, before, beforeCandidate !== reverse ? rect.left : rightOf(rect), line);
    }
    candidate = parent;
  }
  return NO_DROP;
}

/** The pointer is near `element`'s leading or trailing edge along its parent's axis, where a drop goes beside it. */
function inEdgeBand(element: HTMLElement, x: number, y: number): boolean {
  const axis = element.parentElement ? flowOf(element.parentElement).axis : "y";
  const rect = element.getBoundingClientRect();
  const size = axis === "x" ? rect.width : rect.height;
  const position = axis === "x" ? x : y;
  const band = Math.min(24, Math.max(8, size * 0.3));
  return position - startOf(rect, axis) <= band || endOf(rect, axis) - position <= band;
}

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
      return attemptAt(dragged, parent, beforeTarget ? candidate : candidate.nextElementSibling);
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

/**
 * Anchors on the element hover would select. Near its edges, along its parent's axis, the drop goes beside it in its
 * nearest legal parent; anywhere else in a container, including a gap between its children, the drop goes among those
 * children at the pointer. Each container's own axis decides before and after, so an ancestor's layout never
 * redirects a drop away from the element under the pointer.
 */
export function getDropAttemptAtPoint(doc: Document, dragged: HTMLElement, x: number, y: number): DropAttempt {
  const underPointer = htmlElementAtPoint(doc, x, y);
  if (!underPointer) return NO_DROP;
  const hovered = resolveSelectionTarget(underPointer) ?? underPointer;
  if (hovered === dragged || dragged.contains(hovered)) return NO_DROP;
  if (!inEdgeBand(hovered, x, y) && canContainElement(hovered, dragged)) {
    const slot = slotAtPoint(hovered, dragged, x, y);
    if (slot.drop) return slot;
  }
  return besideAtPoint(hovered, dragged, x, y);
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
