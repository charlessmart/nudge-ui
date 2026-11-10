import type { CSSProperties, ReactElement } from "react";
import { getCardEntrance, type CanvasCard } from "../canvas/canvasStore.ts";
import { flowStateOf } from "../canvas/frameContent.ts";
import { flowArrow } from "./flowLayout.ts";
import { useFlows } from "./flowsStore.ts";

const ARROWHEAD_ID = "nudge-flow-arrowhead";

interface FlowGroup {
  readonly title: string;
  readonly byState: Map<string, CanvasCard>;
}

/**
 * Draws what the board adds to a flow's frames: its title above them, clear of their URL bars (see
 * `.flow-board__title`), and a right-angled arrow for each edge with its label. Never takes a pointer.
 */
export function FlowBoardOverlay({ cards }: { readonly cards: readonly CanvasCard[] }): ReactElement | null {
  const groups = new Map<string, FlowGroup>();
  for (const card of cards) {
    const binding = flowStateOf(card.content);
    if (!binding) continue;
    const group = groups.get(binding.flowId) ?? { title: binding.flowTitle, byState: new Map<string, CanvasCard>() };
    group.byState.set(binding.stateId, card);
    groups.set(binding.flowId, group);
  }
  // Only a board showing a flow reads the flow files, so an ordinary Canvas never polls for them.
  return groups.size === 0 ? null : <FlowBoard groups={groups} />;
}

function FlowBoard({ groups }: { readonly groups: ReadonlyMap<string, FlowGroup> }): ReactElement {
  const { flows } = useFlows();
  return (
    <div className="flow-board" data-test="flow-board" aria-hidden="true">
      <svg className="flow-board__defs" width="0" height="0">
        {/* Sized in stroke widths, so the head follows the line's toolbar-pixel thickness at any zoom. */}
        <marker id={ARROWHEAD_ID} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path className="flow-board__arrowhead" d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </svg>
      {[...groups].map(([flowId, { title, byState }]) => {
        const frames = [...byState.values()];
        const edges = flows.find((flow) => flow.id === flowId)?.edges ?? [];
        return (
          <div key={flowId} data-flow-id={flowId}>
            <div
              className={`flow-board__title${frames.some((card) => getCardEntrance(card.id) === 0) ? " is-entering" : ""}`}
              data-test="flow-board-title"
              style={{ left: Math.min(...frames.map((card) => card.x)), top: Math.min(...frames.map((card) => card.y)) }}
            >
              {title}
            </div>
            {edges.map((edge) => {
              const from = byState.get(edge.from);
              const to = byState.get(edge.to);
              if (!from || !to || from === to) return null;
              const arrow = flowArrow(from, to);
              // The arrow appears once the later of its two frames has slid in.
              const entering = Math.max(getCardEntrance(from.id) ?? -1, getCardEntrance(to.id) ?? -1);
              return (
                <div
                  key={`${edge.from}>${edge.to}`}
                  className={`flow-board__edge${entering >= 0 ? " is-entering" : ""}`}
                  data-test="flow-board-edge"
                  data-from={edge.from}
                  data-to={edge.to}
                  style={entering >= 0 ? { "--canvas-card-entrance-column": entering } as CSSProperties : undefined}
                >
                  <svg className="flow-board__arrow" width="1" height="1">
                    <path d={arrow.path} markerEnd={`url(#${ARROWHEAD_ID})`} />
                  </svg>
                  {edge.label ? (
                    <div className="flow-board__label" data-test="flow-board-label" style={{ left: arrow.label.x, top: arrow.label.y }}>
                      {edge.label}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
