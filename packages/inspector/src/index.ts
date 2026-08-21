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
  scheduleCanvasSave,
  setRestoreCount,
} from "./canvas/sessionStore.ts";
import { subscribeChanges, getChangesList } from "./changesLog.ts";
import { subscribeStructuralChanges } from "./structuralProjection.ts";
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
import { clearStructuralChanges, resetStructuralDeleteProjection } from "./structuralProjection.ts";
import { installInspectionBridge } from "./inspection.ts";
import { cancelInlineTextEdit } from "./inlineTextEditor.ts";
import { getDesignToolRuntimeConfig } from "./runtimeConfig.ts";
import { setCanvasMode } from "./canvas/canvasStore.ts";
import { isDesignToolDev } from "./devFlag.ts";

let hostElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let lockedRoot: Root | null = null;
let listenerAttached = false;
let beforeUnloadAttached = false;
let persistenceSubscribed = false;
let unsubscribeOwnership: (() => void) | null = null;
let removeInspectionBridge: (() => void) | null = null;

function onKeydown(e: KeyboardEvent): void {
  if (isInspectorToggleShortcut(e)) {
    toggleInspector();
    e.preventDefault();
  }
}

export function bootstrapDesignTool(inspectorHost: HTMLElement): void {
  if (!isDesignToolDev()) return;

  if (!getDesignToolRuntimeConfig().capabilities.canvas) {
    // A project can be reopened with a runtime that does not expose Canvas.
    // Clear any stale in-memory mode before mounting the static inspector.
    setCanvasMode("inspect");
  }

  removeInspectionBridge?.();
  removeInspectionBridge = installInspectionBridge();

  if (getDesignToolRuntimeConfig().capabilities.canvas && isCanvasRenderer()) {
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
  if (!beforeUnloadAttached) {
    // enableAutoSave registers its flush listener first. Release the lease only
    // after the pending session write has had a chance to pass the ownership
    // gate during beforeunload.
    window.addEventListener("beforeunload", releaseLease);
    beforeUnloadAttached = true;
  }
  if (!persistenceSubscribed) {
    subscribeChanges(() => scheduleAutoSave());
    subscribeStructuralChanges(() => scheduleAutoSave());
    subscribeCanvas(() => scheduleCanvasSave());
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
  cancelInlineTextEdit();
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
  cancelInlineTextEdit();
  setSelectedElement(null);
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  clearChanges();
  clearStructuralChanges();
  resetStructuralDeleteProjection();
  removeManagedSheet();
  clearInspectorLayout();
  removeInspectionBridge?.();
  removeInspectionBridge = null;
  hostElement = null;
}

export { toggleInspector, setInspectorOpen } from "./InspectorShell.tsx";
export { InspectorShell } from "./InspectorShell.tsx";
export { detectFramework } from "./prompt/detectFramework.ts";
export { FloatingToolbar } from "./FloatingToolbar.tsx";
export {
  installStaticHtmlRuntimeIdentity,
  isRuntimeGeneratedSource,
  RUNTIME_ELEMENT_CID_PREFIX,
  RUNTIME_UNKNOWN_SOURCE_PREFIX,
} from "./staticHtmlRuntimeIdentity.ts";
export { assertConformanceFixture, runConformanceFixture } from "./conformance/fixture.ts";
export { DESIGN_TOOL_INSPECTION_VERSION, inspectElement, installInspectionBridge } from "./inspection.ts";
export type { DesignToolInspectionBridge, ElementInspection, InspectElementOptions, InspectionCatalogEntry, InspectionControl } from "./inspection.ts";
export type { ConformanceFixture, ConformanceResult, ConformancePropertyExpectation, ConformanceProjectionExpectation, ConformanceProjectionFieldExpectation } from "./conformance/fixture.ts";
export { TYPOGRAPHY_CASES } from "./conformance/typographyCases.ts";
export {
  beginInlineTextEdit,
  cancelInlineTextEdit,
  disposeInlineTextEdit,
  getInlineTextDiagnostic,
  getInlineTextDiagnostics,
  getInlineTextSession,
  inlineTextEditor,
  isInlineTextEditingActive,
  subscribeInlineTextDiagnostics,
  resolveTextBinding,
  useInlineTextSession,
} from "./inlineTextEditor.ts";
export type {
  InlineTextEditor,
  InlineTextDiagnostic,
  InlineTextSession,
  InlineTextInputRejectionReason,
  InlineTextSessionEndReason,
  TextBindingCandidate,
  TextEditBinding,
  TextEditRejection,
} from "./inlineTextEditor.ts";
export { projectInspectorValues, projectionSides } from "./spacing/projection.ts";
export type { InspectorAxisProjection, InspectorFieldProjection, InspectorProjection, InspectorSpacingProjection, ProjectionAxis, ProjectionGroup, ProjectionSide, ProjectionState } from "./spacing/projection.ts";
export { createBrowserCssInspection } from "./inspection/browserCssInspection.ts";
export {
  configureDesignToolRuntime,
  getDesignToolRuntimeConfig,
  normalizeDesignToolRuntimeConfig,
  subscribeDesignToolRuntime,
} from "./runtimeConfig.ts";
export { useDesignToolRuntimeConfig } from "./useRuntimeConfig.ts";
export { isDesignToolDev, setDesignToolHostDevFlag } from "./devFlag.ts";
export type {
  DesignToolRuntimeConfig,
  DesignToolRuntimeCapabilities,
  DesignToolRuntimeFramework,
  DesignToolRuntimeHost,
} from "./runtimeConfig.ts";
export type {
  BrowserCssInspection,
  BrowserCssInspectionConfig,
  BrowserCssInspectionOptions,
  BrowserTokenKnowledge,
  DocumentTokenInspectionSnapshot,
  InspectionCascade,
  InspectionDiagnostic,
  InspectionDiagnosticCode,
  InspectionRevision,
  InspectionSnapshot,
  InspectionTargetStatus,
} from "./inspection/browserCssInspection.ts";
