import { useEffect, type ReactElement } from "react";
import { useCanvasCards, exitCanvas, type CanvasCard as CanvasCardData } from "./canvasStore.ts";
import { CanvasCard } from "./CanvasCard.tsx";
import { setCanvasMode, useCanvasMode } from "./canvasStore.ts";
import { subscribeChanges } from "../changesLog.ts";
import { projectToAllReadyCards } from "./projection.ts";
import canvasWorkspaceStyles from "./CanvasWorkspace.css?inline";
import canvasCardStyles from "./CanvasCard.css?inline";

const WORKSPACE_STYLES = [canvasWorkspaceStyles, canvasCardStyles].join("\n");

export function CanvasWorkspace(): ReactElement | null {
  const mode = useCanvasMode();
  const cards = useCanvasCards();

  useEffect(() => {
    return subscribeChanges(() => {
      projectToAllReadyCards();
    });
  }, []);

  if (mode !== "canvas" || cards.length === 0) return null;

  function handleEdit(card: CanvasCardData): void {
    setCanvasMode("inspect");
    if (card.url !== window.location.href) {
      window.location.href = card.url;
    }
  }

  return (
    <>
      <style data-test="canvas-styles">{WORKSPACE_STYLES}</style>
      <div className="dt-canvas-workspace" data-test="canvas-workspace">
      <div className="dt-canvas-workspace__header">
        <span className="dt-canvas-workspace__title">Canvas</span>
        <button
          type="button"
          className="dt-canvas-workspace__exit"
          aria-label="Exit Canvas"
          data-test="canvas-exit"
          onClick={() => exitCanvas()}
        >
          Exit Canvas
        </button>
      </div>
      <div className="dt-canvas-workspace__board" data-test="canvas-board">
        {cards.map((card) => (
          <CanvasCard key={card.id} card={card} onEdit={handleEdit} />
        ))}
      </div>
      </div>
    </>
  );
}
