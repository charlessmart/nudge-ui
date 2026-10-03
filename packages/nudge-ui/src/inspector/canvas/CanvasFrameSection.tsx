import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { IconLink } from "@tabler/icons-react";
import { moveFrameGroup, getFrameGroup, type CanvasCard, type CanvasPresentation } from "./canvasStore.ts";
import { getCanvasToolbarScale } from "./toolbarScale.ts";

export function CanvasFrameSection({ id, cards, zoom, presentation, children }: {
  readonly id: string;
  readonly cards: readonly CanvasCard[];
  readonly zoom: number;
  readonly presentation: CanvasPresentation;
  readonly children: ReactNode;
}): ReactElement {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const scale = getCanvasToolbarScale(zoom);
  const left = Math.min(...cards.map((card) => card.x));
  const right = Math.max(...cards.map((card) => card.x + card.width));
  const top = Math.min(...cards.map((card) => card.y));
  const bottom = Math.max(...cards.map((card) => card.y + card.height));
  const padding = 24 * scale;
  const x = left - padding;
  const y = top - 56 * scale;
  const grouped = cards.some((card) => card.groupId === id);
  const group = getFrameGroup(id);
  const first = cards[0]!;
  const title = group?.kind === "agent" ? group.label : first.title || new URL(first.content.kind === "route" ? first.content.url : first.content.sourceUrl).pathname;
  const label = `${title} — ${group?.kind === "agent" ? "Pages" : "Breakpoints"}`;
  return (
    <div
      className={`canvas-frame-section${presentation === "focus" ? " is-focus" : ""}${!grouped ? " is-ungrouped" : ""}`}
      data-test={grouped ? "canvas-linked-group" : undefined}
      data-group-id={grouped ? id : undefined}
      aria-label={label}
      style={{ left: x, top: y, width: right - left + padding * 2, height: bottom - y + padding }}
    >
      <button
        type="button"
        className={`canvas-frame-section__heading${dragging ? " is-dragging" : ""}`}
        aria-label={`Move linked frame group, ${cards.length} frames`}
        style={{ transform: `scale(${scale})`, transformOrigin: "left bottom", bottom: `calc(100% + 8px * ${scale})` }}
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
          moveFrameGroup(id, (event.clientX - previous.x) / zoom, (event.clientY - previous.y) / zoom);
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
          moveFrameGroup(id, direction[0]! * step, direction[1]! * step);
        }}
      >
        <IconLink size={16} stroke={1.8} aria-hidden="true" />
        <span>{label}</span>
        <span className="canvas-frame-section__count">{cards.length}</span>
      </button>
      <div className="canvas-frame-section__content" style={{ left: -x, top: -y }}>
        {children}
      </div>
    </div>
  );
}
