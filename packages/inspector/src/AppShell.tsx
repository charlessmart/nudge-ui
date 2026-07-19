import type { ReactElement } from "react";
import { InspectorShell } from "./InspectorShell.tsx";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace.tsx";

export function AppShell(): ReactElement {
  return (
    <>
      <CanvasWorkspace />
      <InspectorShell />
    </>
  );
}
