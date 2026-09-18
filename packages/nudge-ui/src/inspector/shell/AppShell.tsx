import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "../canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "../canvas/CanvasElementOverlay.tsx";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { readNudgeUiEditorTarget } from "../../transport/editor.ts";

export function AppShell(): ReactElement {
  const canvasEnabled = useNudgeUiRuntimeConfig().capabilities.canvas;
  const primaryUrl = typeof window === "undefined"
    ? null
    : readNudgeUiEditorTarget(window.location.href);
  return (
    <>
      {canvasEnabled ? <CanvasWorkspace primaryUrl={primaryUrl} /> : null}
      {canvasEnabled ? <CanvasElementOverlay /> : null}
      <InspectorShell />
    </>
  );
}
