import { installOwnedStylesheet } from "../runtime/ownedStylesheets.ts";
import { DRAG_ARTIFACT_ATTR, DRAG_ARTIFACT_ROLE, getDropAttemptAtPoint, type DropAttempt } from "./structuralGestures.ts";

/**
 * Lifts a dragged element out of the page while it moves. A copy follows the pointer; while the drop would land
 * somewhere new, the element leaves the layout and an invisible copy fills that slot, so the page reflows around it
 * before release. Without such a drop the element keeps its own box, invisible, so nothing shifts until the pointer
 * finds a new place. Nothing here is a change: the move is still recorded by `moveElement` once the preview is gone.
 *
 * Limits of the copies, which are clones of the element's DOM:
 * - `::before`/`::after` content is not frozen into the pointer copy, so decoration that depends on the element's
 *   ancestors can drop out of it; `<canvas>` copies are blank and media copies show their poster or first frame.
 * - The slot copy is inserted into the page's own (framework-owned) DOM for the length of the drag, where an app's
 *   `MutationObserver` can see it. It carries no identity attributes and is removed before the move is recorded.
 */
export interface DragPreview {
  /** Moves the copy to `point` and the slot to the drop there, returning the drop now on screen. */
  update(point: Point): DropAttempt;
  /** The slot's box when it shows a drop, in the document's viewport coordinates. */
  slotRect(): DOMRect | null;
  /** Removes the preview and returns the drop it last showed, so a release commits exactly what was on screen. */
  finish(): DropAttempt;
  dispose(): void;
}

interface Point {
  x: number;
  y: number;
}

/** `home` keeps the element's box as an invisible gap; `lifted` takes it out of the layout while the slot is elsewhere. */
const SOURCE_ATTR = "data-nudge-ui-drag-source";
const SHEET_KEY = "nudge-ui-drag-preview";
const { placeholder: PLACEHOLDER, ghost: GHOST } = DRAG_ARTIFACT_ROLE;
/** Freezing styles reads every property of every node; past this many nodes the rest keep only their class rules. */
const FROZEN_NODE_LIMIT = 400;

/**
 * Identity tags and ids would make a stand-in look like the element it copies to selection, layers, capture, tests
 * and the app's own queries. Every `data-nudge*` marker is identity too (`data-nudge-def`, the inspector's own).
 */
const IDENTITY_ATTRIBUTES = new Set(["data-cid", "data-src", "data-cprops", "data-cstyle", "data-renderer-id", "data-test", "data-testid", "id", "name", "autofocus", "for"]);

function isIdentityAttribute(name: string): boolean {
  return IDENTITY_ATTRIBUTES.has(name) || name.startsWith("data-nudge");
}

const PREVIEW_CSS = `
  [${SOURCE_ATTR}="lifted"] { display: none !important; }
  [${SOURCE_ATTR}="home"],
  [${SOURCE_ATTR}="home"] *,
  [${DRAG_ARTIFACT_ATTR}="${PLACEHOLDER}"],
  [${DRAG_ARTIFACT_ATTR}="${PLACEHOLDER}"] * {
    visibility: hidden !important;
    pointer-events: none !important;
  }
  [${DRAG_ARTIFACT_ATTR}="${PLACEHOLDER}"],
  [${DRAG_ARTIFACT_ATTR}="${PLACEHOLDER}"] * {
    transition: none !important;
    animation: none !important;
  }
  [${DRAG_ARTIFACT_ATTR}="${GHOST}"] {
    position: fixed !important;
    right: auto !important;
    bottom: auto !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    transform: none !important;
    rotate: none !important;
    scale: none !important;
    z-index: 2147483647 !important;
    opacity: 0.88 !important;
    filter: drop-shadow(0 8px 18px rgb(0 0 0 / 18%)) !important;
  }
  [${DRAG_ARTIFACT_ATTR}="${GHOST}"],
  [${DRAG_ARTIFACT_ATTR}="${GHOST}"] * {
    visibility: visible !important;
    pointer-events: none !important;
    transition: none !important;
    animation: none !important;
  }
`;

/** A copy with no identity and no behaviour: it renders like the element and is otherwise invisible to the page. */
function standIn(source: HTMLElement, role: string): HTMLElement {
  // SAFETY: cloning an HTMLElement deeply yields an HTMLElement of the same type.
  const clone = source.cloneNode(true) as HTMLElement;
  for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const name of element.getAttributeNames()) {
      if (isIdentityAttribute(name)) element.removeAttribute(name);
    }
    // A copied frame or media element would load and play a second time.
    if (element.localName === "iframe") {
      element.removeAttribute("src");
      element.removeAttribute("srcdoc");
    }
    element.removeAttribute("autoplay");
  }
  clone.setAttribute(DRAG_ARTIFACT_ATTR, role);
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  return clone;
}

/** HTML and SVG elements carry an inline style declaration; other namespaces (MathML aside) do not. */
function inlineStyleOf(element: Element): CSSStyleDeclaration | null {
  // SAFETY: the `in` check proves the element exposes ElementCSSInlineStyle, whose `style` is a CSSStyleDeclaration.
  return "style" in element ? (element as Element & ElementCSSInlineStyle).style : null;
}

/**
 * The copy under the pointer lives outside the element's ancestors, where rules such as `.row span` no longer
 * reach it, so it carries the element's computed styles inline. Clones mirror the source tree node for node.
 */
function freezeStyles(source: Element, clone: Element, budget: { nodes: number }): void {
  if (budget.nodes <= 0) return;
  budget.nodes -= 1;
  const view = source.ownerDocument.defaultView;
  const style = inlineStyleOf(clone);
  if (view && style) {
    const computed = view.getComputedStyle(source);
    let cssText = "";
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed[index]!;
      cssText += `${name}:${computed.getPropertyValue(name)};`;
    }
    style.cssText = cssText;
  }
  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  for (let index = 0; index < sourceChildren.length && index < cloneChildren.length; index += 1) {
    freezeStyles(sourceChildren[index]!, cloneChildren[index]!, budget);
  }
}

function sameDrop(left: DropAttempt, right: DropAttempt): boolean {
  if (!left.drop || !right.drop) return left.drop === right.drop;
  return left.drop.parent === right.drop.parent && left.drop.before === right.drop.before;
}

function containsPoint(rect: DOMRect, point: Point): boolean {
  return rect.width > 0 && rect.height > 0
    && point.x >= rect.left && point.x <= rect.left + rect.width
    && point.y >= rect.top && point.y <= rect.top + rect.height;
}

export function startDragPreview(dragged: HTMLElement, grabPoint: Point): DragPreview {
  const doc = dragged.ownerDocument;
  const rect = dragged.getBoundingClientRect();

  const placeholder = standIn(dragged, PLACEHOLDER);
  const ghost = standIn(dragged, GHOST);
  // Read before the element is hidden, while its styles are still the ones on screen.
  freezeStyles(dragged, ghost, { nodes: FROZEN_NODE_LIMIT });
  ghost.style.setProperty("width", `${rect.width}px`, "important");
  ghost.style.setProperty("height", `${rect.height}px`, "important");
  ghost.style.setProperty("left", `${rect.left}px`, "important");
  ghost.style.setProperty("top", `${rect.top}px`, "important");
  ghost.style.setProperty("translate", "0px 0px", "important");

  const removeStyles = installOwnedStylesheet(doc, SHEET_KEY, PREVIEW_CSS);
  (doc.body ?? doc.documentElement).append(ghost);
  dragged.setAttribute(SOURCE_ATTR, "home");

  // A transformed ancestor of the copy is its containing block; measure once and correct for it. Later moves only
  // translate the copy, which repaints it without laying out the page again.
  const placed = ghost.getBoundingClientRect();
  ghost.style.setProperty("left", `${2 * rect.left - placed.left}px`, "important");
  ghost.style.setProperty("top", `${2 * rect.top - placed.top}px`, "important");

  let lastAttempt: DropAttempt = { drop: null, rejection: null };
  let disposed = false;

  function moveGhost(point: Point): void {
    ghost.style.setProperty("translate", `${point.x - grabPoint.x}px ${point.y - grabPoint.y}px`, "important");
  }

  function showSlot(parent: Node, before: Node | null): void {
    if (placeholder.parentNode !== parent || placeholder.nextSibling !== before) parent.insertBefore(placeholder, before);
    dragged.setAttribute(SOURCE_ATTR, "lifted");
  }

  function returnHome(): void {
    placeholder.remove();
    dragged.setAttribute(SOURCE_ATTR, "home");
  }

  function show(attempt: DropAttempt): void {
    lastAttempt = attempt;
    if (attempt.drop) showSlot(attempt.drop.parent, attempt.drop.before);
    else returnHome();
  }

  /**
   * Each measurement is taken in the layout the shown slot produced, so moving the slot can change what the same
   * still pointer is over. Measure once more after a move: a slot the new layout agrees with stays; if the new layout
   * points elsewhere, try that one, and if the two keep pointing at each other keep the first so nothing flickers.
   */
  function settle(point: Point, attempt: DropAttempt): void {
    const shown = lastAttempt;
    show(attempt);
    // An unchanged slot left the layout as it was, so the measurement already stands.
    if (sameDrop(attempt, shown)) return;
    const check = getDropAttemptAtPoint(doc, dragged, point.x, point.y);
    if (sameDrop(check, attempt)) return;
    show(check);
    const again = getDropAttemptAtPoint(doc, dragged, point.x, point.y);
    if (!sameDrop(again, check)) show(attempt);
  }

  function update(point: Point): DropAttempt {
    if (disposed) return lastAttempt;
    // The slot is where the element would land. While the pointer is over it, keep that drop: measuring the layout
    // the slot itself shifted could pick a neighbouring slot, and the next move would pick this one again.
    if (!(lastAttempt.drop && containsPoint(placeholder.getBoundingClientRect(), point))) {
      settle(point, getDropAttemptAtPoint(doc, dragged, point.x, point.y));
    }
    moveGhost(point);
    return lastAttempt;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    placeholder.remove();
    ghost.remove();
    dragged.removeAttribute(SOURCE_ATTR);
    removeStyles();
  }

  return {
    update,
    slotRect: () => (!disposed && lastAttempt.drop ? placeholder.getBoundingClientRect() : null),
    finish() {
      // Not measured again at the release point: the last move may not have painted yet, and the release must
      // commit the slot the user saw.
      const shown = lastAttempt;
      dispose();
      return shown;
    },
    dispose,
  };
}
