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
import {
  acquireLease,
  enableWriteGuard,
  hasWriteLease,
  releaseLease,
  subscribeOwnership,
} from "./canvas/workspaceLease.ts";
import { startStaleDetection } from "./canvas/staleChangeDetector.ts";
import { LockedWorkspaceNotice } from "./canvas/LockedWorkspaceNotice.tsx";
import { AppShell } from "./AppShell.tsx";

let hostElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let lockedRoot: Root | null = null;
let listenerAttached = false;
let beforeUnloadAttached = false;
let persistenceSubscribed = false;
let unsubscribeOwnership: (() => void) | null = null;

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

  enableWriteGuard();
  const leaseGranted = acquireLease();
  if (!leaseGranted) {
    mountLockedNotice(inspectorHost);
    return;
  }

  startController(inspectorHost);
}

function startController(inspectorHost: HTMLElement): void {
  if (!hasWriteLease()) {
    mountLockedNotice(inspectorHost);
    return;
  }

  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }

  if (!beforeUnloadAttached) {
    window.addEventListener("beforeunload", releaseLease);
    beforeUnloadAttached = true;
  }

  unsubscribeOwnership?.();
  unsubscribeOwnership = subscribeOwnership((hasLease) => {
    if (!hasLease) mountLockedNotice(inspectorHost);
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
  if (!persistenceSubscribed) {
    subscribeChanges(() => scheduleAutoSave());
    subscribeCanvas(() => scheduleAutoSave());
    persistenceSubscribed = true;
  }
}

function mountLockedNotice(host: HTMLElement): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (listenerAttached) {
    window.removeEventListener("keydown", onKeydown);
    listenerAttached = false;
  }
  setInspectorOpen(false);
  setSelectedElement(null);
  clearInspectorLayout();
  removeManagedSheet();
  hostElement = null;
  unsubscribeOwnership?.();
  unsubscribeOwnership = null;

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!lockedRoot) {
    lockedRoot = createRoot(shadow);
  }
  lockedRoot.render(createElement(LockedWorkspaceNotice, {
    onTakeover: () => startController(host),
  }));
}

export function mountInspector(host: HTMLElement): void {
  if (!hasWriteLease()) return;
  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }
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
  unsubscribeOwnership?.();
  unsubscribeOwnership = null;
  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }
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
