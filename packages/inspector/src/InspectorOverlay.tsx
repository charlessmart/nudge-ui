import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useInspectorOpen } from "./openStore.ts";
import { useSelectedElement } from "./selectionStore.ts";
import { installElementSelector } from "./elementSelector.ts";
import {
  getMarginFills,
  getMarginGuides,
  readMargins,
  toRect,
  type Margins,
  type Rect,
} from "./overlayGeometry.ts";
import { getDropLocationAtPoint, moveElement } from "./domMutations.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { installInteractionStyles } from "./interactionStyles.ts";
import { clearDropGuide, showDropGuide, useDropGuide } from "./dropGuide.ts";
import { DropGuideOverlay } from "./DropGuideOverlay.tsx";
import { createFrameThrottle } from "./frameThrottle.ts";
import { getMeasurementGeometry } from "./measurementGeometry.ts";
import { MeasurementGuideOverlay } from "./MeasurementGuideOverlay.tsx";
import { resolveSelectionTarget, selectionTargetMode } from "./selectionTarget.ts";

export {
  getMarginFills,
  getMarginGuides,
  type MarginFill,
  type MarginGuide,
  type MarginGuideSide,
} from "./overlayGeometry.ts";

export function InspectorOverlay({ host }: { host: HTMLElement }): ReactElement {
  const open = useInspectorOpen();
  const selected = useSelectedElement();
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [hoverMargins, setHoverMargins] = useState<Margins | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [optionDown, setOptionDown] = useState(false);
  const [pointerOverPage, setPointerOverPage] = useState(false);
  const dropGuide = useDropGuide("inspect");
  const hoverElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setHoverRect(null);
      setHoverMargins(null);
      hoverElRef.current = null;
      setPointerOverPage(false);
      return;
    }
    let observedHover: HTMLElement | null = null;
    const ResizeObserverCtor = window.ResizeObserver;
    const hoverResizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(scheduleHoverRecalc) : null;

    function clearHover(): void {
      hoverElRef.current = null;
      setHoverRect(null);
      setHoverMargins(null);
      hoverResizeObserver?.disconnect();
      observedHover = null;
    }
    function observeHover(el: HTMLElement): void {
      if (observedHover === el) return;
      hoverResizeObserver?.disconnect();
      hoverResizeObserver?.observe(el);
      observedHover = el;
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
        setPointerOverPage(false);
        clearHover();
        return;
      }
      setPointerOverPage(true);
      const el = resolveSelectionTarget(target, selectionTargetMode(e));
      if (!el) {
        clearHover();
        return;
      }
      hoverElRef.current = el;
      observeHover(el);
      scheduleHoverRecalc();
    }
    function onMouseOut(e: MouseEvent): void {
      if (isDraggingRef.current) return;
      const related = e.relatedTarget;
      if (!related || !(related instanceof Node)) {
        setPointerOverPage(false);
        clearHover();
        return;
      }
      if (host === related || host.contains(related)) {
        setPointerOverPage(false);
        clearHover();
        return;
      }
      const nearest = resolveSelectionTarget(related, selectionTargetMode(e));
      if (nearest !== hoverElRef.current) clearHover();
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
      hoverResizeObserver?.disconnect();
    };
  }, [open, host]);

  useEffect(() => {
    let raf = 0;
    const ResizeObserverCtor = window.ResizeObserver;
    const selectedResizeObserver = selected && ResizeObserverCtor ? new ResizeObserverCtor(schedule) : null;
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
    if (selected) selectedResizeObserver?.observe(selected.domElement);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      selectedResizeObserver?.disconnect();
    };
  }, [selected]);

  useEffect(() => {
    if (!open) {
      setOptionDown(false);
      return;
    }
    function updateOptionState(event: KeyboardEvent): void {
      setOptionDown(event.altKey);
    }
    function clearOptionState(): void {
      setOptionDown(false);
    }
    window.addEventListener("keydown", updateOptionState);
    window.addEventListener("keyup", updateOptionState);
    window.addEventListener("blur", clearOptionState);
    return () => {
      window.removeEventListener("keydown", updateOptionState);
      window.removeEventListener("keyup", updateOptionState);
      window.removeEventListener("blur", clearOptionState);
    };
  }, [open]);

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
      const target = resolveSelectionTarget(event.target, selectionTargetMode(event));
      if (!target) return;
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
  const showGuideOverlay = open
    && optionDown
    && pointerOverPage
    && selectedRect;
  const showMeasurement = showGuideOverlay
    && hoverRect
    && hoverElRef.current !== selected?.domElement;
  const measurement = showMeasurement && selectedRect && hoverRect
    ? getMeasurementGeometry(selectedRect, hoverRect)
    : null;

  return (
    <>
      {showGuideOverlay && selectedRect ? (
        <MeasurementGuideOverlay
          selectedRect={selectedRect}
          segments={measurement?.segments ?? []}
        />
      ) : null}
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
