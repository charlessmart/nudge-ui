import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace.tsx";
import { useCanvasMode } from "./canvas/canvasStore.ts";

export function AppShell(): ReactElement {
  const mode = useCanvasMode();

  return (
    <>
      <div style={mode !== "inspect" ? { display: "none" } : undefined}>
        <InspectorShell />
      </div>
      <CanvasWorkspace />
    </>
  );
}
