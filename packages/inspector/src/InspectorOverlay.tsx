import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useInspectorOpen } from "./openStore.ts";
import { useSelectedElement, useSelectedElements } from "./selectionStore.ts";
import { installElementSelector } from "./elementSelector.ts";
import {
  getMarginFills,
  getMarginGuides,
  readBorderWidths,
  readMargins,
  toRect,
  type BorderWidths,
  type Margins,
  type Rect,
} from "./overlayGeometry.ts";
import { observeSelectedGeometry } from "./selectedGeometry.ts";
import { getDropLocationAtPoint, moveElement } from "./structuralGestures.ts";
import { resolveSelectionFromElement } from "./resolveSelection.ts";
import { setSelectedElement } from "./selectionStore.ts";
import { installInteractionStyles } from "./interactionStyles.ts";
import { clearDropGuide, showDropGuide, useDropGuide } from "./dropGuide.ts";
import { DropGuideOverlay } from "./DropGuideOverlay.tsx";
import { createFrameThrottle } from "./frameThrottle.ts";
import { getMeasurementGeometry } from "./measurementGeometry.ts";
import { MeasurementGuideOverlay } from "./MeasurementGuideOverlay.tsx";
import { resolveSelectionTarget, selectionTargetMode } from "./selectionTarget.ts";
import { isInlineTextEditingActive, useInlineTextSession } from "./inlineTextEditor.ts";
import { EMPTY_TEXT_PROJECTION_ATTR } from "./textProjection.ts";

export {
  getMarginFills,
  getMarginGuides,
  type MarginFill,
  type MarginGuide,
  type MarginGuideSide,
} from "./overlayGeometry.ts";

function overlayStyle(rect: Rect): CSSProperties {
  return {
    position: "fixed",
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    pointerEvents: "none",
  };
}

export function InspectorOverlay({ host }: { host: HTMLElement }): ReactElement {
  const open = useInspectorOpen();
  const selected = useSelectedElement();
  const selectedElements = useSelectedElements();
  const inlineTextSession = useInlineTextSession();
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [hoverMargins, setHoverMargins] = useState<Margins | null>(null);
  const [hoverBorders, setHoverBorders] = useState<BorderWidths | null>(null);
  const [selectedRects, setSelectedRects] = useState<readonly Rect[]>([]);
  const [selectedBorders, setSelectedBorders] = useState<BorderWidths | null>(null);
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
      setHoverBorders(null);
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
      setHoverBorders(null);
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
        setHoverBorders(null);
        return;
      }
      setHoverRect(toRect(el.getBoundingClientRect()));
      setHoverMargins(readMargins(el));
      setHoverBorders(readBorderWidths(el));
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
  }, [open, host, selectedElements.length]);

  useEffect(() => {
    let raf = 0;
    function recalc(): void {
      setSelectedRects(selectedElements.map((candidate) => toRect(candidate.domElement.getBoundingClientRect())));
      if (selected) {
        setSelectedBorders(readBorderWidths(selected.domElement));
      } else {
        setSelectedBorders(null);
      }
    }
    function schedule(): void {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recalc);
    }
    recalc();
    const stopObserving = selectedElements.map((candidate) =>
      observeSelectedGeometry(candidate.domElement, schedule));
    return () => {
      cancelAnimationFrame(raf);
      stopObserving.forEach((stop) => stop());
    };
  }, [selectedElements]);

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
      if (isInlineTextEditingActive()) return;
      if (selectedElements.length > 1) return;
      if (event.button !== 0 || !(event.target instanceof HTMLElement)) return;
      if (host === event.target || host.contains(event.target)) return;
      if (event.target.closest(`[${EMPTY_TEXT_PROJECTION_ATTR}]`)) return;
      const target = resolveSelectionTarget(event.target, selectionTargetMode(event));
      if (!target) return;
      candidate = target;
      start = { x: event.clientX, y: event.clientY };
    }

    function onPointerMove(event: MouseEvent): void {
      if (isInlineTextEditingActive()) return;
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
      if (isInlineTextEditingActive()) return;
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
  }, [open, host, selectedElements.length]);

  const selectedGeometry = selectedElements.flatMap((candidate, index) => {
    const rect = selectedRects[index];
    return rect ? [{ element: candidate, rect }] : [];
  });
  const selectedPrimaryIndex = selectedElements.findIndex((candidate) => candidate.domElement === selected?.domElement);
  const selectedRect = selectedRects[selectedPrimaryIndex >= 0 ? selectedPrimaryIndex : 0] ?? null;

  const hoverStyle: CSSProperties = hoverRect ? overlayStyle(hoverRect) : { display: "none" };

  const hoverMarginGuides = hoverRect && hoverMargins
    ? getMarginGuides(hoverRect, hoverMargins)
    : [];
  const hoverMarginFills = hoverRect && hoverMargins
    ? getMarginFills(hoverRect, hoverMargins)
    : [];
  const showGuideOverlay = open
    && selectedElements.length === 1
    && optionDown
    && pointerOverPage
    && selectedRect;
  const showMeasurement = showGuideOverlay
    && hoverRect
    && hoverElRef.current !== selected?.domElement;
  const measurement = showMeasurement && selectedRect && hoverRect
    ? getMeasurementGeometry(selectedRect, hoverRect, {
        selectedBorders: selectedBorders ?? undefined,
        hoveredBorders: hoverBorders ?? undefined,
      })
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
              className="hover-margin-fill"
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
          <div className="hover-outline" style={hoverStyle} aria-hidden="true" />
          {hoverMarginGuides.map((guide) => (
            <div
              key={guide.side}
              className="hover-margin"
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
      {open && !inlineTextSession ? selectedGeometry.map(({ element, rect }, index) => (
        <div
          key={`${element.domElement.getAttribute("data-cid") ?? "element"}-${index}`}
          className="selected-outline"
          data-test="selected-outline"
          data-selected-index={index}
          style={overlayStyle(rect)}
          aria-hidden="true"
        />
      )) : null}
      {open && selectedElements.length === 1 ? <DropGuideOverlay
        guide={dropGuide?.document === document
          ? { orientation: dropGuide.orientation, line: dropGuide.line, target: dropGuide.target }
          : null}
        lineClassName="dom-drop-line"
        lineTestId="dom-drop-line"
        targetClassName="dom-drop-target"
        targetTestId="dom-drop-target"
      /> : null}
    </>
  );
}
