import { useRef, useState, type ReactElement } from "react";
import { IconLink } from "@tabler/icons-react";
import { moveLinkedGroup, type CanvasCard } from "./canvasStore.ts";
import { getCanvasToolbarScale } from "./toolbarScale.ts";

/** The shared drag handle for live views of one editable design. */
export function LinkedFrameGroup({ id, cards, zoom }: {
  readonly id: string;
  readonly cards: readonly CanvasCard[];
  readonly zoom: number;
}): ReactElement {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const scale = getCanvasToolbarScale(zoom);
  const left = Math.min(...cards.map((card) => card.x));
  const right = Math.max(...cards.map((card) => card.x + card.width));
  const top = Math.min(...cards.map((card) => card.y));
  return (
    <div
      className={`canvas-linked-group${dragging ? " is-dragging" : ""}`}
      data-test="canvas-linked-group"
      data-group-id={id}
      role="button"
      tabIndex={0}
      aria-label={`Move linked frame group, ${cards.length} frames`}
      style={{
        left,
        top: `calc(${top}px - (var(--control-height-large) * 2 + var(--space-8) + var(--space-12)) * ${scale})`,
        width: (right - left) / scale,
        transform: `scale(${scale})`,
        transformOrigin: "left top",
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const previous = drag.current;
        if (!previous || previous.pointerId !== event.pointerId) return;
        moveLinkedGroup(id, (event.clientX - previous.x) / zoom, (event.clientY - previous.y) / zoom);
        drag.current = { ...previous, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => { drag.current = null; setDragging(false); }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onKeyDown={(event) => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 40 : 10;
        moveLinkedGroup(id, direction[0]! * step, direction[1]! * step);
      }}
    >
      <IconLink size={16} stroke={1.8} aria-hidden="true" />
      <span>Linked frames</span>
      <span className="canvas-linked-group__count">{cards.length}</span>
    </div>
  );
}
