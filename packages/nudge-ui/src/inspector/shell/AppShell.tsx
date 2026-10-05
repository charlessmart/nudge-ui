import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "../canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "../canvas/CanvasElementOverlay.tsx";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { readNudgeUiEditorTarget } from "../../transport/editor.ts";
import { TooltipGroup } from "../ui/Tooltip.tsx";

import { CommentsOverlay } from "../comments/CommentsOverlay.tsx";

export function AppShell(): ReactElement {
  const canvasEnabled = useNudgeUiRuntimeConfig().capabilities.canvas;
  const primaryUrl = typeof window === "undefined"
    ? null
    : readNudgeUiEditorTarget(window.location.href);
  return (
    <TooltipGroup>
      {canvasEnabled ? <CanvasWorkspace primaryUrl={primaryUrl} /> : null}
      {canvasEnabled ? <CanvasElementOverlay /> : null}
      {canvasEnabled ? <CommentsOverlay /> : null}
      <InspectorShell />
    </TooltipGroup>
  );
}
