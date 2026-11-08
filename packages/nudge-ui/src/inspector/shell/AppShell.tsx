import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "../canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "../canvas/CanvasElementOverlay.tsx";
import { isPageSurface } from "../canvas/pageSurface.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { readNudgeUiEditorTarget } from "../../transport/editor.ts";
import { TooltipGroup } from "../ui/Tooltip.tsx";
import { ToastRegion } from "../ui/Toast.tsx";

import { CommentsOverlay } from "../comments/CommentsOverlay.tsx";
import { NavigatorPanel } from "../navigator/NavigatorPanel.tsx";
import { isNavigatorAvailable } from "../navigator/navigatorStore.ts";
import { useInspectorOpen } from "./openStore.ts";

export function AppShell(): ReactElement {
  const config = useNudgeUiRuntimeConfig();
  const canvasEnabled = config.capabilities.canvas;
  // Hiding the inspector hides every panel, so the page has the whole window.
  const inspectorOpen = useInspectorOpen();
  const primaryUrl = typeof window === "undefined"
    ? null
    : isPageSurface()
      ? window.location.href
      : readNudgeUiEditorTarget(window.location.href);
  return (
    <TooltipGroup>
      {canvasEnabled ? <CanvasWorkspace primaryUrl={primaryUrl} /> : null}
      {canvasEnabled ? <CanvasElementOverlay /> : null}
      {canvasEnabled ? <CommentsOverlay /> : null}
      {inspectorOpen && isNavigatorAvailable(config) ? <NavigatorPanel /> : null}
      <InspectorShell />
      <ToastRegion />
    </TooltipGroup>
  );
}
