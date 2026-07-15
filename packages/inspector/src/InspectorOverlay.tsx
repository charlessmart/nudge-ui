import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useInspectorOpen } from "./openStore.ts";
import { useSelectedElement } from "./selectionStore.ts";
import { installElementSelector } from "./elementSelector.ts";

interface Rect {
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

export function InspectorOverlay({ host }: { host: HTMLElement }): ReactElement {
  const open = useInspectorOpen();
  const selected = useSelectedElement();
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const hoverElRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setHoverRect(null);
      hoverElRef.current = null;
      return;
    }
    function recalcHover(): void {
      const el = hoverElRef.current;
      if (!el) {
        setHoverRect(null);
        return;
      }
      setHoverRect(toRect(el.getBoundingClientRect()));
    }
    function scheduleHoverRecalc(): void {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recalcHover);
    }
    function onMouseOver(e: MouseEvent): void {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (host === target || host.contains(target)) {
        hoverElRef.current = null;
        setHoverRect(null);
        return;
      }
      const el = target.closest("[data-cid]");
      if (!el || !(el instanceof HTMLElement)) {
        hoverElRef.current = null;
        setHoverRect(null);
        return;
      }
      hoverElRef.current = el;
      recalcHover();
    }
    function onMouseOut(e: MouseEvent): void {
      const related = e.relatedTarget;
      if (!related || !(related instanceof Node)) {
        hoverElRef.current = null;
        setHoverRect(null);
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

  return (
    <>
      {open && hoverRect ? (
        <div className="dt-hover-outline" style={hoverStyle} aria-hidden="true" />
      ) : null}
      {open && selectedRect ? (
        <div className="dt-selected-outline" style={selectedStyle} aria-hidden="true" />
      ) : null}
    </>
  );
}
