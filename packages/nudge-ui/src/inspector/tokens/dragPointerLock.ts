import { showLockedDragCursor } from "../ui/dragCursor.ts";

export function startDragPointerLock(
  handle: HTMLElement,
  point: { x: number; y: number },
  onMove: (event: MouseEvent) => void,
  onEnd: () => void,
): { isLocked: () => boolean; setCursorOffset: (dx: number) => void; stop: () => void } {
  const doc = handle.ownerDocument;
  const root = handle.getRootNode() as Document | ShadowRoot;
  const isLocked = (): boolean => root.pointerLockElement === handle;
  let stopped = false;
  let pending = true;
  let acquired = false;
  let cursor: ReturnType<typeof showLockedDragCursor> | undefined;
  let cursorOffset = 0;
  /** The locked pointer cannot leave its point, so vertical travel moves only the virtual cursor. */
  let cursorDy = 0;
  const applyCursor = (): void => cursor?.setOffset(cursorOffset, cursorDy);

  function removeLockListeners(): void {
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
  }

  function onLockChange(): void {
    if (isLocked()) {
      pending = false;
      acquired = true;
      if (stopped) {
        doc.exitPointerLock();
        removeLockListeners();
      } else if (!cursor) {
        cursor = showLockedDragCursor(doc, point);
        applyCursor();
      }
    } else if (acquired) {
      onEnd();
    }
  }

  function onLockError(): void {
    pending = false;
    removeLockListeners();
  }

  function onMouseMove(event: MouseEvent): void {
    if (stopped || !isLocked()) return;
    const height = doc.defaultView?.innerHeight ?? Infinity;
    cursorDy = Math.min(height - point.y, Math.max(-point.y, cursorDy + event.movementY));
    applyCursor();
    onMove(event);
  }

  function onMouseUp(event: MouseEvent): void {
    if (event.button === 0) onEnd();
  }

  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  try {
    // Older implementations return void; a rejection still leaves pointer-capture dragging.
    const request = handle.requestPointerLock();
    if (request) void request.catch(onLockError);
  } catch {
    onLockError();
  }

  return {
    isLocked,
    setCursorOffset(dx) {
      cursorOffset = dx;
      applyCursor();
    },
    stop() {
      stopped = true;
      cursor?.remove();
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("mouseup", onMouseUp);
      if (isLocked()) doc.exitPointerLock();
      // A pending request can acquire the lock after mouse-up; release that late lock too.
      if (!pending) removeLockListeners();
    },
  };
}
