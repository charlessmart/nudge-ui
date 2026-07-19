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
import {
  hydrateSession,
  enableAutoSave,
  scheduleAutoSave,
  setRestoreCount,
} from "./canvas/sessionStore.ts";
import { subscribeChanges, getChangesList } from "./changesLog.ts";
import { subscribe as subscribeCanvas } from "./canvas/canvasStore.ts";
import { acquireLease, hasWriteLease, releaseLease } from "./canvas/workspaceLease.ts";
import { startStaleDetection } from "./canvas/staleChangeDetector.ts";
import { LockedWorkspaceNotice } from "./canvas/LockedWorkspaceNotice.tsx";
import { AppShell } from "./AppShell.tsx";

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

  const leaseGranted = acquireLease();
  if (!leaseGranted) {
    mountLockedNotice(inspectorHost);
    return;
  }

  window.addEventListener("beforeunload", () => {
    releaseLease();
  });

  const result = hydrateSession();
  if (result.restored) {
    setRestoreCount(result.changeCount);
    const restored = getChangesList();
    if (restored.length > 0) {
      startStaleDetection(restored);
    }
  }

  mountInspector(inspectorHost);

  enableAutoSave();
  subscribeChanges(() => scheduleAutoSave());
  subscribeCanvas(() => scheduleAutoSave());
}

let lockedRoot: Root | null = null;

function mountLockedNotice(host: HTMLElement): void {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!lockedRoot) {
    lockedRoot = createRoot(shadow);
    lockedRoot.render(createElement(LockedWorkspaceNotice));
  }
}

export function mountInspector(host: HTMLElement): void {
  if (!hasWriteLease()) return;
  if (!hostElement) hostElement = host;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    setInspectorHost(host);
    reactRoot.render(createElement(AppShell));
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
