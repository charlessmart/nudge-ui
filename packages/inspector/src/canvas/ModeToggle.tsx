import type { ReactElement } from "react";
import { useCanvasMode, enterCanvas, exitCanvas } from "./canvasStore.ts";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";

export function ModeToggle(): ReactElement {
  const mode = useCanvasMode();
  const isCanvas = mode === "canvas";

  return (
    <SegmentedControl
      value={isCanvas ? "canvas" : "preview"}
      aria-label="Inspector mode"
      data-test="canvas-mode-toggle"
      options={[
        { value: "preview", label: "Preview", testId: "mode-preview" },
        { value: "canvas", label: "Canvas", testId: "mode-canvas" },
      ]}
      onChange={(nextMode) => {
        if (nextMode === "canvas" && !isCanvas) enterCanvas();
        if (nextMode === "preview" && isCanvas) exitCanvas();
      }}
    />
  );
}
