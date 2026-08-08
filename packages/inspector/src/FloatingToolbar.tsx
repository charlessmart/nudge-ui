import type { ReactElement } from "react";
import { IconPointer } from "@tabler/icons-react";
import { useCanvasMode, enterCanvas, exitCanvas } from "./canvas/canvasStore.ts";
import { useInspectorOpen } from "./openStore.ts";
import { SegmentedControl } from "./ui/SegmentedControl.tsx";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import floatingToolbarStyles from "./FloatingToolbar.css?inline";

export function FloatingToolbar(): ReactElement | null {
  const isOpen = useInspectorOpen();
  const mode = useCanvasMode();
  const isCanvas = mode === "canvas";

  if (!isOpen) return null;

  return (
    <>
      <style>{floatingToolbarStyles}</style>
      <div className="dt-floating-toolbar" data-test="floating-toolbar">
        <div className="dt-floating-toolbar__tools" role="group" aria-label="Tools">
          <button
            type="button"
            className="dt-floating-toolbar__tool is-active"
            aria-pressed="true"
            aria-label="Select"
            data-test="tool-select"
          >
            <IconPointer size={16} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
        <SegmentedControl
          value={isCanvas ? "canvas" : "preview"}
          aria-label="View mode"
          data-test="view-mode-toggle"
          options={[
            { value: "preview", label: "Preview", testId: "mode-preview" },
            { value: "canvas", label: "Canvas", testId: "mode-canvas" },
          ]}
          onChange={(nextMode) =>   {
            if (nextMode === "canvas" && !isCanvas) enterCanvas();
            if (nextMode === "preview" && isCanvas) exitCanvas();
          }}
        />
        <CopyPromptButton />
      </div>
    </>
  );
}
