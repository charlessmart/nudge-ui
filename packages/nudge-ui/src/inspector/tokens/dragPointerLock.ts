import { showLockedDragCursor } from "../ui/dragCursor.ts";

/** Keeps mouse drags relative, including when the handle is inside a shadow root. */
export function startDragPointerLock(
  handle: HTMLElement,
  point: { x: number; y: number },
  onMove: (event: MouseEvent) => void,
  onEnd: () => void,
): { isLocked: () => boolean; stop: () => void } {
  const doc = handle.ownerDocument;
  const root = handle.getRootNode() as Document | ShadowRoot;
  const isLocked = (): boolean => root.pointerLockElement === handle;
  let stopped = false;
  let pending = true;
  let acquired = false;
  let removeCursor: (() => void) | undefined;

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
      } else if (!removeCursor) {
        removeCursor = showLockedDragCursor(doc, point);
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
    if (!stopped && isLocked()) onMove(event);
  }

  function onMouseUp(event: MouseEvent): void {
    if (event.button === 0) onEnd();
  }

  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  try {
    // Older implementations return void. Rejections retain pointer-capture dragging.
    const request = handle.requestPointerLock();
    if (request) void request.catch(onLockError);
  } catch {
    onLockError();
  }

  return {
    isLocked,
    stop() {
      stopped = true;
      removeCursor?.();
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("mouseup", onMouseUp);
      if (isLocked()) doc.exitPointerLock();
      // A request can finish after mouse-up or unmount. Release that late lock too.
      if (!pending) removeLockListeners();
    },
  };
}
