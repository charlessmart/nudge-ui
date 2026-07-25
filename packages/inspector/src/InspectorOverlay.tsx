import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useInspectorOpen } from "./openStore.ts";
import { useSelectedElement } from "./selectionStore.ts";
import { installElementSelector } from "./elementSelector.ts";
import { getDropLocationAtPoint, moveElement } from "./domMutations.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { installInteractionStyles } from "./interactionStyles.ts";
import { clearDropGuide, showDropGuide, useDropGuide } from "./dropGuide.ts";
import { DropGuideOverlay } from "./DropGuideOverlay.tsx";
import { createFrameThrottle } from "./frameThrottle.ts";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MarginGuideSide = keyof Margins;

export interface MarginGuide {
  side: MarginGuideSide;
  axis: "horizontal" | "vertical";
  distance: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MarginFill {
  side: MarginGuideSide;
  left: number;
  top: number;
  width: number;
  height: number;
}

function toRect(domRect: DOMRect): Rect {
  return {
    left: domRect.left,
    top: domRect.top,
    width: domRect.width,
    height: domRect.height,
  };
}

function toPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readMargins(element: HTMLElement): Margins {
  const style = getComputedStyle(element);
  return {
    top: toPixels(style.marginTop),
    right: toPixels(style.marginRight),
    bottom: toPixels(style.marginBottom),
    left: toPixels(style.marginLeft),
  };
}

export function getMarginGuides(rect: Rect, margins: Margins): MarginGuide[] {
  const guides: MarginGuide[] = [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  if (Math.abs(margins.top) > 0.01) {
    guides.push({
      side: "top",
      axis: "horizontal",
      distance: margins.top,
      left: rect.left,
      top: rect.top - margins.top,
      width: rect.width,
      height: 0,
    });
  }
  if (Math.abs(margins.right) > 0.01) {
    guides.push({
      side: "right",
      axis: "vertical",
      distance: margins.right,
      left: right + margins.right,
      top: rect.top,
      width: 0,
      height: rect.height,
    });
  }
  if (Math.abs(margins.bottom) > 0.01) {
    guides.push({
      side: "bottom",
      axis: "horizontal",
      distance: margins.bottom,
      left: rect.left,
      top: bottom + margins.bottom,
      width: rect.width,
      height: 0,
    });
  }
  if (Math.abs(margins.left) > 0.01) {
    guides.push({
      side: "left",
      axis: "vertical",
      distance: margins.left,
      left: rect.left - margins.left,
      top: rect.top,
      width: 0,
      height: rect.height,
    });
  }

  return guides;
}

export function getMarginFills(rect: Rect, margins: Margins): MarginFill[] {
  const fills: MarginFill[] = [];
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  if (margins.top > 0.01) {
    fills.push({
      side: "top",
      left: rect.left,
      top: rect.top - margins.top,
      width: rect.width,
      height: margins.top,
    });
  }
  if (margins.right > 0.01) {
    fills.push({
      side: "right",
      left: right,
      top: rect.top,
      width: margins.right,
      height: rect.height,
    });
  }
  if (margins.bottom > 0.01) {
    fills.push({
      side: "bottom",
      left: rect.left,
      top: bottom,
      width: rect.width,
      height: margins.bottom,
    });
  }
  if (margins.left > 0.01) {
    fills.push({
      side: "left",
      left: rect.left - margins.left,
      top: rect.top,
      width: margins.left,
      height: rect.height,
    });
  }

  return fills;
}

export function InspectorOverlay({ host }: { host: HTMLElement }): ReactElement {
  const open = useInspectorOpen();
  const selected = useSelectedElement();
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [hoverMargins, setHoverMargins] = useState<Margins | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const dropGuide = useDropGuide("inspect");
  const hoverElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setHoverRect(null);
      setHoverMargins(null);
      hoverElRef.current = null;
      return;
    }
    function recalcHover(): void {
      if (isDraggingRef.current) return;
      const el = hoverElRef.current;
      if (!el) {
        setHoverRect(null);
        setHoverMargins(null);
        return;
      }
      setHoverRect(toRect(el.getBoundingClientRect()));
      setHoverMargins(readMargins(el));
    }
    function scheduleHoverRecalc(): void {
      if (isDraggingRef.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recalcHover);
    }
    function onMouseOver(e: MouseEvent): void {
      if (isDraggingRef.current) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (host === target || host.contains(target)) {
        hoverElRef.current = null;
        setHoverRect(null);
        setHoverMargins(null);
        return;
      }
      const el = target.closest("[data-cid]");
      if (!el || !(el instanceof HTMLElement)) {
        hoverElRef.current = null;
        setHoverRect(null);
        setHoverMargins(null);
        return;
      }
      hoverElRef.current = el;
      scheduleHoverRecalc();
    }
    function onMouseOut(e: MouseEvent): void {
      if (isDraggingRef.current) return;
      const related = e.relatedTarget;
      if (!related || !(related instanceof Node)) {
        hoverElRef.current = null;
        setHoverRect(null);
        setHoverMargins(null);
        return;
      }
      if (host === related || host.contains(related)) {
        return;
      }
      if (related instanceof HTMLElement) {
        const nearest = related.closest("[data-cid]");
        if (nearest instanceof HTMLElement && nearest !== hoverElRef.current) {
          hoverElRef.current = null;
          setHoverRect(null);
          setHoverMargins(null);
        }
      }
    }
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    window.addEventListener("resize", scheduleHoverRecalc);
    window.addEventListener("scroll", scheduleHoverRecalc, true);
    const removeClickCapture = installElementSelector(host);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseout", onMouseOut, true);
      removeClickCapture();
      window.removeEventListener("resize", scheduleHoverRecalc);
      window.removeEventListener("scroll", scheduleHoverRecalc, true);
    };
  }, [open, host]);

  useEffect(() => {
    let raf = 0;
    function recalc(): void {
      if (selected) {
        setSelectedRect(toRect(selected.domElement.getBoundingClientRect()));
      } else {
        setSelectedRect(null);
      }
    }
    function schedule(): void {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recalc);
    }
    recalc();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const removeInteractionStyles = installInteractionStyles();
    let candidate: HTMLElement | null = null;
    let dragging = false;
    let start: { x: number; y: number } | null = null;
    function updateGuide(point: { x: number; y: number }): void {
      if (!candidate) return;
      const drop = getDropLocationAtPoint(document, candidate, point.x, point.y);
      if (drop) showDropGuide("inspect", document, drop);
      else clearDropGuide("inspect");
    }

    const guideUpdate = createFrameThrottle(updateGuide);

    function clear(): void {
      guideUpdate.cancel();
      isDraggingRef.current = false;
      candidate = null;
      dragging = false;
      start = null;
      clearDropGuide("inspect");
    }

    function onPointerDown(event: MouseEvent): void {
      if (event.button !== 0 || !(event.target instanceof HTMLElement)) return;
      if (host === event.target || host.contains(event.target)) return;
      const target = event.target.closest("[data-cid]");
      if (!(target instanceof HTMLElement)) return;
      candidate = target;
      start = { x: event.clientX, y: event.clientY };
    }

    function onPointerMove(event: MouseEvent): void {
      if (!candidate || !start) return;
      if (!dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      if (!dragging) {
        dragging = true;
        isDraggingRef.current = true;
        hoverElRef.current = null;
        setHoverRect(null);
        setHoverMargins(null);
        const selected = resolveSelectionFromElement(candidate);
        if (selected) setSelectedElement(selected);
        updateGuide(point);
        return;
      }
      guideUpdate.schedule(point);
    }

    function onPointerUp(event: MouseEvent): void {
      if (!candidate || !dragging) {
        clear();
        return;
      }
      event.preventDefault();
      const drop = getDropLocationAtPoint(document, candidate, event.clientX, event.clientY);
      if (drop) moveElement(candidate, drop);
      const selected = resolveSelectionFromElement(candidate);
      if (selected) setSelectedElement(selected);
      clear();
    }

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("mousemove", onPointerMove, true);
    document.addEventListener("mouseup", onPointerUp, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("mousemove", onPointerMove, true);
      document.removeEventListener("mouseup", onPointerUp, true);
      guideUpdate.cancel();
      isDraggingRef.current = false;
      clearDropGuide("inspect");
      removeInteractionStyles();
    };
  }, [open, host]);

  const hoverStyle: CSSProperties = hoverRect
    ? {
        position: "fixed",
        left: hoverRect.left,
        top: hoverRect.top,
        width: hoverRect.width,
        height: hoverRect.height,
        pointerEvents: "none",
      }
    : { display: "none" };

  const selectedStyle: CSSProperties = selectedRect
    ? {
        position: "fixed",
        left: selectedRect.left,
        top: selectedRect.top,
        width: selectedRect.width,
        height: selectedRect.height,
        pointerEvents: "none",
      }
    : { display: "none" };

  const hoverMarginGuides = hoverRect && hoverMargins
    ? getMarginGuides(hoverRect, hoverMargins)
    : [];
  const hoverMarginFills = hoverRect && hoverMargins
    ? getMarginFills(hoverRect, hoverMargins)
    : [];

  return (
    <>
      {open && hoverRect ? (
        <>
          {hoverMarginFills.map((fill) => (
            <div
              key={fill.side}
              className="dt-hover-margin-fill"
              data-side={fill.side}
              style={{
                position: "fixed",
                left: fill.left,
                top: fill.top,
                width: fill.width,
                height: fill.height,
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
          ))}
          <div className="dt-hover-outline" style={hoverStyle} aria-hidden="true" />
          {hoverMarginGuides.map((guide) => (
            <div
              key={guide.side}
              className="dt-hover-margin"
              data-axis={guide.axis}
              data-distance={guide.distance}
              data-side={guide.side}
              style={{
                position: "fixed",
                left: guide.left,
                top: guide.top,
                width: guide.width,
                height: guide.height,
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
          ))}
        </>
      ) : null}
      {open && selectedRect ? (
        <>
          <div className="dt-selected-outline" data-test="selected-outline" style={selectedStyle} aria-hidden="true" />
        </>
      ) : null}
      {open ? <DropGuideOverlay
        guide={dropGuide?.document === document
          ? { orientation: dropGuide.orientation, line: dropGuide.line, target: dropGuide.target }
          : null}
        lineClassName="dt-dom-drop-line"
        lineTestId="dom-drop-line"
        targetClassName="dt-dom-drop-target"
        targetTestId="dom-drop-target"
      /> : null}
    </>
  );
}
