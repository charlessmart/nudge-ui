import { getCanvasResizeEdges, type CanvasResizeDirection } from "../canvas/canvasResize.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { isPageTarget } from "../selection/pageTarget.ts";
import type { StyleDeclaration } from "../tokens/editActions.ts";
import { toPixels, toRect, type Rect } from "./overlayGeometry.ts";

/**
 * Edge and corner resizing of the selected element, as a design tool does it.
 *
 * Sizing model, whatever the element's authored sizing (auto, fit-content, %, a flex fill):
 * - Handles sit on the right edge, the bottom edge and the bottom-right corner only. `width` and `height` grow a box
 *   in normal flow away from its top-left corner, so those are the edges that follow the pointer; a left or top handle
 *   would grow the element away from the cursor. Moving the top-left corner needs a position or margin edit, which a
 *   size gesture must not make behind the user's back. Layouts that anchor the box elsewhere (centred, end-aligned,
 *   right-to-left) still move the edge at a different rate from the pointer.
 * - Only the axis a handle drags is touched; an edge drag leaves the other axis as authored.
 * - The dragged axis becomes a fixed px value, measured from what the element renders at the start of the drag, so
 *   the first pixel of travel never jumps.
 * - The handles follow the element's border box, which is the size the selection label shows; for a content-box
 *   element the written value subtracts its padding and border.
 * - Sizes are worked out in the element's own CSS px. Under a scaled ancestor (`transform: scale()`, `zoom`) its
 *   on-screen box is larger or smaller than its layout box, so screen measurements and pointer travel are divided
 *   by that scale; otherwise the first frame would write the on-screen size and the scale would apply twice.
 * - A flex item resized along its container's main axis is made "fixed" (`flex-grow: 0`, `flex-shrink: 0`, a
 *   `flex-basis: auto`), since a fill item would ignore the new width and a shrinking one would give part of it back
 *   on a full row. The preview applies the same declarations, so any overflow this causes shows before release.
 * - The committed value is the size the element actually renders after the preview, so a min/max clamp is authored
 *   as the clamped size rather than a value the page never shows.
 */

/** The handles whose edge moves when `width`/`height` change, in hit-test order: the corner wins where they meet. */
export type ResizeHandle = Extract<CanvasResizeDirection, "right" | "bottom" | "bottom-right">;

export const RESIZE_HANDLES = ["bottom-right", "right", "bottom"] as const satisfies readonly ResizeHandle[];

export type ResizeCursor = "ew-resize" | "ns-resize" | "nwse-resize";

/** The drawn handle's side in screen px. The controller converts it into the frame's px for the renderer's hit test. */
export const RESIZE_HANDLE_SIZE = 8;
/** The hit square is half again the drawn one, so the pointer can land on it without pixel hunting. */
const HIT_REACH_PER_SIZE = 0.75;
/** An edge too short to hold its handle clear of the corner's only offers the corner. */
const EDGE_HANDLE_MIN_SPAN = 3;

type SizeProperty = "width" | "height";

interface AxisPlan {
  property: SizeProperty;
  dragAxis: "x" | "y";
  /** Border-box size when the drag began, in the element's own (unscaled) CSS pixels. */
  startBorderBox: number;
  /** On-screen px per element CSS px along this axis, from scaled ancestors; 1 when nothing scales it. */
  scale: number;
  /** Padding and border a content-box element adds on top of its `width`/`height`. */
  boxOffset: number;
  /** The authored-equivalent value the element painted before the drag, as px. */
  startValue: number;
  /** Flex longhands that keep a main-axis flex item at the dragged size. */
  flexFixes: StyleDeclaration[];
}

export interface ResizePlan {
  element: HTMLElement;
  handle: ResizeHandle;
  width: AxisPlan | null;
  height: AxisPlan | null;
}

export interface ResizeSize {
  width: number | null;
  height: number | null;
}

interface Point {
  x: number;
  y: number;
}

const SHIFT_STEP = 8;
const EPSILON = 0.5;

const REPLACED_ELEMENTS = new Set(["img", "video", "canvas", "iframe", "embed", "object", "svg", "input", "select", "textarea", "button", "picture"]);

export function isResizeHandle(value: string): value is ResizeHandle {
  return RESIZE_HANDLES.some((handle) => handle === value);
}

export function resizeCursor(handle: ResizeHandle): ResizeCursor {
  switch (handle) {
    case "right":
      return "ew-resize";
    case "bottom":
      return "ns-resize";
    case "bottom-right":
      return "nwse-resize";
  }
}

/**
 * Width and height do nothing on non-replaced inline boxes, table internals and `display: contents`. The page target
 * and the root fill the viewport, so their handles would sit on the frame's own edges.
 */
export function isResizable(element: HTMLElement): boolean {
  if (!element.isConnected || isPageTarget(element) || element === element.ownerDocument.documentElement) return false;
  const style = getElementComputedStyle(element);
  const display = style.display;
  if (display === "none" || display === "contents") return false;
  if (display.startsWith("table-") && display !== "table-caption") return false;
  if (display === "inline" && !REPLACED_ELEMENTS.has(element.localName)) return false;
  return true;
}

/** The handles drawn on `rect` (in any one coordinate space) for handles `handleSize` wide in that same space. */
export function visibleResizeHandles(rect: Rect, handleSize: number): ResizeHandle[] {
  const minSpan = handleSize * EDGE_HANDLE_MIN_SPAN;
  return RESIZE_HANDLES.filter((handle) =>
    handle === "bottom-right" || (handle === "right" ? rect.height >= minSpan : rect.width >= minSpan));
}

function handleCentre(rect: Rect, handle: ResizeHandle): Point {
  const edges = getCanvasResizeEdges(handle);
  return {
    x: edges.horizontal === "right" ? rect.left + rect.width : rect.left + rect.width / 2,
    y: edges.vertical === "bottom" ? rect.top + rect.height : rect.top + rect.height / 2,
  };
}

/**
 * The handle under the pointer for an element that is already selected. Only the drawn handles are hit, so a click
 * anywhere else along the outline still selects whatever is there. `handleSize` is the drawn side in the element's
 * document px, which shrinks as the canvas zooms in so the hit square stays the size of the drawn one on screen.
 */
export function getResizeHandleAtPoint(element: HTMLElement, x: number, y: number, handleSize: number): ResizeHandle | null {
  const rect = toRect(element.getBoundingClientRect());
  if (rect.width <= 0 || rect.height <= 0 || !(handleSize > 0)) return null;
  const reach = handleSize * HIT_REACH_PER_SIZE;
  // Inside the box a handle reaches at most a quarter of the way in, so a small element's centre still moves it.
  const insideX = Math.min(reach, rect.width / 4);
  const insideY = Math.min(reach, rect.height / 4);
  const hit = visibleResizeHandles(rect, handleSize).find((handle) => {
    const edges = getCanvasResizeEdges(handle);
    const centre = handleCentre(rect, handle);
    const dx = x - centre.x;
    const dy = y - centre.y;
    const withinX = edges.horizontal ? dx >= -insideX && dx <= reach : Math.abs(dx) <= reach;
    const withinY = edges.vertical ? dy >= -insideY && dy <= reach : Math.abs(dy) <= reach;
    return withinX && withinY;
  });
  return hit && isResizable(element) ? hit : null;
}

/**
 * On-screen px per layout px: the bounding rect includes ancestor transforms and zoom, `offsetWidth`/`offsetHeight`
 * do not. Within a pixel of each other they agree up to `offset*` rounding, so an unscaled element reads exactly 1.
 */
function layoutScale(element: HTMLElement, property: SizeProperty, onScreen: number): number {
  const layout = property === "width" ? element.offsetWidth : element.offsetHeight;
  if (!(layout > 0) || !(onScreen > 0) || Math.abs(onScreen - layout) < 1) return 1;
  return onScreen / layout;
}

/** Main axis of the element's flex container, or null when it is not a flex item. */
function flexMainAxis(element: HTMLElement): SizeProperty | null {
  const parent = element.parentElement;
  if (!parent) return null;
  const parentStyle = getElementComputedStyle(parent);
  if (parentStyle.display !== "flex" && parentStyle.display !== "inline-flex") return null;
  const position = getElementComputedStyle(element).position;
  if (position === "absolute" || position === "fixed") return null;
  return parentStyle.flexDirection.startsWith("column") ? "height" : "width";
}

function flexFixes(element: HTMLElement, property: SizeProperty): StyleDeclaration[] {
  if (flexMainAxis(element) !== property) return [];
  const style = getElementComputedStyle(element);
  const fixes: StyleDeclaration[] = [];
  const grow = style.flexGrow || style.getPropertyValue("flex-grow");
  const shrink = style.flexShrink || style.getPropertyValue("flex-shrink");
  const basis = (style.flexBasis || style.getPropertyValue("flex-basis")).trim();
  if (grow && toPixels(grow) !== 0) fixes.push({ property: "flex-grow", value: "0", oldRawValue: grow });
  if (shrink && toPixels(shrink) !== 0) fixes.push({ property: "flex-shrink", value: "0", oldRawValue: shrink });
  // A definite basis outranks width on the main axis.
  if (basis && basis !== "auto" && basis !== "content") fixes.push({ property: "flex-basis", value: "auto", oldRawValue: basis });
  return fixes;
}

function axisPlan(element: HTMLElement, property: SizeProperty): AxisPlan {
  const style = getElementComputedStyle(element);
  const rect = toRect(element.getBoundingClientRect());
  const onScreen = property === "width" ? rect.width : rect.height;
  const scale = layoutScale(element, property, onScreen);
  const startBorderBox = onScreen / scale;
  const boxOffset = style.boxSizing === "border-box"
    ? 0
    : property === "width"
      ? toPixels(style.paddingLeft) + toPixels(style.paddingRight) + toPixels(style.borderLeftWidth) + toPixels(style.borderRightWidth)
      : toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
  return {
    property,
    dragAxis: property === "width" ? "x" : "y",
    startBorderBox,
    scale,
    boxOffset,
    startValue: Math.max(0, Math.round(startBorderBox - boxOffset)),
    flexFixes: flexFixes(element, property),
  };
}

export function planResize(element: HTMLElement, handle: ResizeHandle): ResizePlan {
  const edges = getCanvasResizeEdges(handle);
  return {
    element,
    handle,
    width: edges.horizontal ? axisPlan(element, "width") : null,
    height: edges.vertical ? axisPlan(element, "height") : null,
  };
}

function axisValue(axis: AxisPlan, start: Point, point: Point, shiftKey: boolean): number {
  const delta = (axis.dragAxis === "x" ? point.x - start.x : point.y - start.y) / axis.scale;
  let borderBox = axis.startBorderBox + delta;
  // Shift snaps the border box to the 8px grid, in the element's own px (what the selection label shows when unscaled).
  if (shiftKey) borderBox = Math.round(borderBox / SHIFT_STEP) * SHIFT_STEP;
  return Math.max(0, Math.round(borderBox - axis.boxOffset));
}

/** The `width`/`height` values the pointer asks for, in px, for the axes the handle drags. */
export function resizeValuesForDrag(plan: ResizePlan, start: Point, point: Point, shiftKey = false): ResizeSize {
  return {
    width: plan.width ? axisValue(plan.width, start, point, shiftKey) : null,
    height: plan.height ? axisValue(plan.height, start, point, shiftKey) : null,
  };
}

/** The axes a plan drags, each with the value `size` asks of it (null for an axis `size` leaves alone). */
function plannedAxes(plan: ResizePlan, size: ResizeSize = { width: null, height: null }): Array<[AxisPlan, number | null]> {
  return [plan.width, plan.height].flatMap((axis): Array<[AxisPlan, number | null]> => axis
    ? [[axis, axis.property === "width" ? size.width : size.height]]
    : []);
}

/** Every inline property a resize preview writes, so a cancel can restore each one. */
export function resizePreviewProperties(plan: ResizePlan): string[] {
  return plannedAxes(plan).flatMap(([axis]) => [axis.property, ...axis.flexFixes.map((fix) => fix.property)]);
}

/** Inline declarations for the preview at `size`. */
export function resizePreviewDeclarations(plan: ResizePlan, size: ResizeSize): Array<{ property: string; value: string }> {
  return plannedAxes(plan, size).flatMap(([axis, value]) => value === null ? [] : [
    { property: axis.property, value: `${value}px` },
    ...axis.flexFixes.map((fix) => ({ property: fix.property, value: fix.value })),
  ]);
}

function renderedAxisValue(axis: AxisPlan, want: number | null, actualBorderBox: number): number | null {
  if (want === null) return null;
  const actual = Math.max(0, actualBorderBox / axis.scale - axis.boxOffset);
  return Math.abs(actual - want) < EPSILON ? want : Math.round(actual);
}

/**
 * The size the previewed element really renders, as `width`/`height` px values: a min/max clamp or a grid track
 * wins over the pointer, and the commit records what the page shows.
 */
export function renderedResizeValues(plan: ResizePlan, requested: ResizeSize): ResizeSize {
  const rect = toRect(plan.element.getBoundingClientRect());
  return {
    width: plan.width ? renderedAxisValue(plan.width, requested.width, rect.width) : null,
    height: plan.height ? renderedAxisValue(plan.height, requested.height, rect.height) : null,
  };
}

/** Declarations to commit; empty when the drag ended at the size the element already painted. */
export function resizeCommitDeclarations(plan: ResizePlan, size: ResizeSize): StyleDeclaration[] {
  return plannedAxes(plan, size).flatMap(([axis, value]): StyleDeclaration[] => value === null || value === axis.startValue ? [] : [
    { property: axis.property, value: `${value}px`, oldRawValue: `${axis.startValue}px` },
    ...axis.flexFixes,
  ]);
}
