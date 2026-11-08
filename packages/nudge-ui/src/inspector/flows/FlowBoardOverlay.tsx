import type { ReactElement } from "react";
import { getCardEntrance, type CanvasCard } from "../canvas/canvasStore.ts";
import { flowStateOf } from "../canvas/frameContent.ts";

/** Draws each flow's title above its frames, clear of their URL bars (see `.flow-board__title`). Never takes a pointer. */
export function FlowBoardOverlay({ cards }: { readonly cards: readonly CanvasCard[] }): ReactElement | null {
  const groups = new Map<string, { title: string; frames: CanvasCard[] }>();
  for (const card of cards) {
    const binding = flowStateOf(card.content);
    if (!binding) continue;
    const group = groups.get(binding.flowId) ?? { title: binding.flowTitle, frames: [] };
    group.frames.push(card);
    groups.set(binding.flowId, group);
  }
  if (groups.size === 0) return null;
  return (
    <div className="flow-board" data-test="flow-board" aria-hidden="true">
      {[...groups].map(([flowId, { title, frames }]) => (
        <div
          key={flowId}
          className={`flow-board__title${frames.some((card) => getCardEntrance(card.id) === 0) ? " is-entering" : ""}`}
          data-test="flow-board-title"
          data-flow-id={flowId}
          style={{ left: Math.min(...frames.map((card) => card.x)), top: Math.min(...frames.map((card) => card.y)) }}
        >
          {title}
        </div>
      ))}
    </div>
  );
}
