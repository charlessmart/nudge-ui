import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "../canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "../canvas/CanvasElementOverlay.tsx";
import { isPageSurface } from "../canvas/pageSurface.ts";
import { readNudgeUiEditorTarget } from "../../transport/editor.ts";
import { TooltipGroup } from "../ui/Tooltip.tsx";
import { ToastRegion } from "../ui/Toast.tsx";

import { CommentsOverlay } from "../comments/CommentsOverlay.tsx";

export function AppShell(): ReactElement {
  const primaryUrl = typeof window === "undefined"
    ? null
    : isPageSurface()
      ? window.location.href
      : readNudgeUiEditorTarget(window.location.href);
  return (
    <TooltipGroup>
      <CanvasWorkspace primaryUrl={primaryUrl} />
      <CanvasElementOverlay />
      <CommentsOverlay />
      <InspectorShell />
      <ToastRegion />
    </TooltipGroup>
  );
}
