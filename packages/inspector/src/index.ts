import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { InspectorShell, toggleInspector, setInspectorOpen, setInspectorHost } from "./InspectorShell.tsx";
import { setSelectedElement } from "./selectionStore.ts";
import { clearChanges } from "./changesLog.ts";
import { removeManagedSheet } from "./managedStylesheet.ts";
import { isInspectorToggleShortcut } from "./shortcuts.ts";
import { clearInspectorLayout } from "./panelLayout.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";
import { bootstrapRenderer } from "./canvas/rendererBootstrap.ts";
import { CanvasWorkspace } from "./canvas/CanvasWorkspace.tsx";
import {
  hydrateSession,
  enableAutoSave,
  scheduleAutoSave,
  setRestoreCount,
} from "./canvas/sessionStore.ts";
import { subscribeChanges } from "./changesLog.ts";
import { subscribe as subscribeCanvas } from "./canvas/canvasStore.ts";

let hostElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let listenerAttached = false;

function onKeydown(e: KeyboardEvent): void {
  if (isInspectorToggleShortcut(e)) {
    toggleInspector();
    e.preventDefault();
  }
}

export function bootstrapDesignTool(inspectorHost: HTMLElement): void {
  if (!import.meta.env.DEV) return;

  if (isCanvasRenderer()) {
    bootstrapRenderer();
    return;
  }

  const result = hydrateSession();
  if (result.restored) {
    setRestoreCount(result.changeCount);
  }

  mountInspector(inspectorHost);

  let canvasHost = document.getElementById("design-tool-canvas-host");
  if (!canvasHost) {
    canvasHost = document.createElement("div");
    canvasHost.id = "design-tool-canvas-host";
    document.body.appendChild(canvasHost);
  }
  mountCanvasWorkspace(canvasHost);

  enableAutoSave();
  subscribeChanges(() => scheduleAutoSave());
  subscribeCanvas(() => scheduleAutoSave());
}

let canvasRoot: Root | null = null;

function mountCanvasWorkspace(host: HTMLElement): void {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!canvasRoot) {
    canvasRoot = createRoot(shadow);
    canvasRoot.render(createElement(CanvasWorkspace));
  }
}

export function mountInspector(host: HTMLElement): void {
  if (!hostElement) hostElement = host;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    setInspectorHost(host);
    reactRoot.render(createElement(InspectorShell));
  }
  setInspectorOpen(true);
  if (!listenerAttached) {
    window.addEventListener("keydown", onKeydown);
    listenerAttached = true;
  }
}

export function unmountInspector(): void {
  if (listenerAttached) {
    window.removeEventListener("keydown", onKeydown);
    listenerAttached = false;
  }
  setSelectedElement(null);
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  clearChanges();
  removeManagedSheet();
  clearInspectorLayout();
  hostElement = null;
}

export { toggleInspector, setInspectorOpen } from "./InspectorShell.tsx";
export { InspectorShell } from "./InspectorShell.tsx";
export { assertConformanceFixture, runConformanceFixture } from "./conformance/fixture.ts";
export type { ConformanceFixture, ConformanceResult, ConformancePropertyExpectation, ConformanceProjectionExpectation, ConformanceProjectionFieldExpectation } from "./conformance/fixture.ts";
export { TYPOGRAPHY_CASES } from "./conformance/typographyCases.ts";
export { projectInspectorValues, projectionSides } from "./spacing/projection.ts";
export type { InspectorAxisProjection, InspectorFieldProjection, InspectorProjection, InspectorSpacingProjection, ProjectionAxis, ProjectionGroup, ProjectionSide, ProjectionState } from "./spacing/projection.ts";
