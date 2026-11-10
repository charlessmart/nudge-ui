import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { Rect } from "./overlayGeometry.ts";

export interface SelectionLabelProps {
  element: HTMLElement;
  /** The selection's rect in viewport pixels, which places the label. */
  anchor: Rect;
  /** The selection's size in its own frame's CSS pixels, so it reads the same at any board zoom. */
  size: Pick<Rect, "width" | "height">;
  /** The visible frame; the label keeps inside it, and is hidden once the element has scrolled fully out. */
  bounds: Rect;
  /** The selection is a component or shares its source with other elements. */
  linked?: boolean;
}

/** Space between the selection's bottom edge and the label, and the closest the label gets to the frame's edge. */
const LABEL_GAP = 8;
const EDGE_MARGIN = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Centers the label below the selection, as Figma places its size label, and keeps it inside the visible frame. */
export function selectionLabelPosition(
  anchor: Rect,
  label: { width: number; height: number },
  bounds: Rect,
): { left: number; top: number } {
  return {
    left: Math.round(clamp(anchor.left + anchor.width / 2 - label.width / 2, bounds.left + EDGE_MARGIN, bounds.left + bounds.width - label.width - EDGE_MARGIN)),
    top: Math.round(clamp(anchor.top + anchor.height + LABEL_GAP, bounds.top + EDGE_MARGIN, bounds.top + bounds.height - label.height - EDGE_MARGIN)),
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

/** Names the selected element's tag and size just below it; it never takes the pointer, so the margin band under it stays editable. */
export function SelectionLabel({ element, anchor, size, bounds, linked = false }: SelectionLabelProps): ReactElement | null {
  const tag = element.localName;
  const sizeText = `${Math.round(size.width)} × ${Math.round(size.height)}`;
  const labelRef = useRef<HTMLDivElement>(null);
  const [labelSize, setLabelSize] = useState({ width: 0, height: 0 });
  const visible = rectsIntersect(anchor, bounds);
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const { offsetWidth: width, offsetHeight: height } = label;
    setLabelSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  }, [tag, sizeText, visible]);
  if (!visible) return null;

  return (
    <div
      ref={labelRef}
      className="selection-label"
      data-test="selection-label"
      data-linked={linked ? "true" : undefined}
      style={selectionLabelPosition(anchor, labelSize, bounds)}
      aria-hidden="true"
    >
      <span className="selection-label__tag">{tag}</span>
      <span className="selection-label__size" data-test="selection-label-size">{sizeText}</span>
    </div>
  );
}
