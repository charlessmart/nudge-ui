import type { ReactElement } from "react";
import { useCanvasMode, enterCanvas, exitCanvas } from "./canvasStore.ts";

export function ModeToggle(): ReactElement {
  const mode = useCanvasMode();
  const isCanvas = mode === "canvas";

  return (
    <div className="dt-canvas-mode-toggle" data-test="canvas-mode-toggle">
      <button
        type="button"
        className={`dt-canvas-mode-toggle__btn${isCanvas ? "" : " dt-canvas-mode-toggle__btn--active"}`}
        aria-pressed={!isCanvas}
        data-test="mode-inspect"
        onClick={() => {
          if (isCanvas) exitCanvas();
        }}
      >
        Inspect
      </button>
      <button
        type="button"
        className={`dt-canvas-mode-toggle__btn${isCanvas ? " dt-canvas-mode-toggle__btn--active" : ""}`}
        aria-pressed={isCanvas}
        data-test="mode-canvas"
        onClick={() => {
          if (!isCanvas) enterCanvas();
        }}
      >
        Canvas
      </button>
    </div>
  );
}
