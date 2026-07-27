import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "./canvas/CanvasElementOverlay.tsx";
import { FloatingToolbar } from "./FloatingToolbar.tsx";

export function AppShell(): ReactElement {
  return (
    <>
      <CanvasWorkspace />
      <CanvasElementOverlay />
      <InspectorShell />
      <FloatingToolbar />
    </>
  );
}
