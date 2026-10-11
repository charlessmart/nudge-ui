import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

/** Matches the `width` transition in CanvasToolbar.css. */
const SLIDE_DURATION_MS = 220;

// The toolbar is remounted when sketching moves it into a root-level portal.
// Remember each drawer's last state and width so the new instance can animate
// from them; it can mount before its content has been laid out.
const lastOpen = new Map<string, boolean>();
const lastWidth = new Map<string, number>();

export interface ToolOptionsDrawerProps {
  /** Stable name that identifies the drawer across toolbar remounts. */
  readonly name: string;
  readonly open: boolean;
  readonly label: string;
  /**
   * Renders the drawer content. `hidden` removes controls from the tab order;
   * `settled` is true once the slide finishes and content may overflow the bar.
   */
  readonly children: (state: { readonly hidden: boolean; readonly settled: boolean }) => ReactNode;
}

/** Slides tool-specific options out of the canvas toolbar beside their tool. */
export function ToolOptionsDrawer({ name, open, label, children }: ToolOptionsDrawerProps): ReactElement {
  const [expanded, setExpanded] = useState(() => lastOpen.get(name) ?? false);
  const [settled, setSettled] = useState(() => (lastOpen.get(name) ?? false) && open);
  const [contentWidth, setContentWidth] = useState(() => lastWidth.get(name) ?? 0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = (): void => {
      if (inner.offsetWidth === 0) return;
      lastWidth.set(name, inner.offsetWidth);
      setContentWidth(inner.offsetWidth);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(inner);
    return () => observer?.disconnect();
  }, [name]);

  useEffect(() => {
    lastOpen.set(name, open);
    if (!open) setSettled(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      // Tool clicks and shortcuts are discrete events, so React can run this
      // effect before a freshly mounted toolbar is ever styled. Flush its
      // previous state first so the width change transitions instead of jumping.
      void drawerRef.current?.offsetWidth;
      setExpanded(open);
      if (open) timer = setTimeout(() => setSettled(true), SLIDE_DURATION_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [name, open]);

  return (
    <div
      ref={drawerRef}
      className="tool-options"
      role="group"
      aria-label={label}
      aria-hidden={!open}
      data-expanded={expanded ? "true" : "false"}
      data-settled={settled ? "true" : "false"}
      data-test={`${name}-tool-options`}
      style={{ width: expanded ? contentWidth : 0 }}
    >
      <div className="tool-options__inner" ref={innerRef}>
        {children({ hidden: !open, settled })}
      </div>
    </div>
  );
}

/** Closes a toolbar popover on an outside pointer press or Escape. */
export function useDismissablePopover(
  open: boolean,
  rootRef: { readonly current: HTMLElement | null },
  close: () => void,
): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) closeRef.current();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, rootRef]);
}
