import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace.tsx";
import { CanvasElementOverlay } from "./canvas/CanvasElementOverlay.tsx";
import { useDesignToolRuntimeConfig } from "./useRuntimeConfig.ts";

export function AppShell(): ReactElement {
  const canvasEnabled = useDesignToolRuntimeConfig().capabilities.canvas;
  return (
    <>
      {canvasEnabled ? <CanvasWorkspace /> : null}
      {canvasEnabled ? <CanvasElementOverlay /> : null}
      <InspectorShell />
    </>
  );
}
