import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { InspectorShell, toggleInspector, setInspectorOpen, setInspectorHost } from "./shell/InspectorShell.tsx";
import { setSelectedElement } from "./selection/selectionStore.ts";
import { removeManagedSheet } from "./projection/managedStylesheet.ts";
import { isInspectorToggleShortcut } from "./shell/shortcuts.ts";
import { clearInspectorLayout } from "./shell/panelLayout.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";
import { bootstrapRenderer } from "./canvas/rendererBootstrap.ts";
import {
  hydrateSession,
  enableAutoSave,
  scheduleAutoSave,
  scheduleCanvasSave,
  setRestoreCount,
} from "./canvas/sessionStore.ts";
import { subscribeChanges, getChangesList } from "./changes/changesLog.ts";
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
import { AppShell } from "./shell/AppShell.tsx";
import { installInspectionBridge } from "./inspection/bridge.ts";
import { cancelInlineTextEdit } from "./inline-text/inlineTextEditor.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig, isDemoRuntime } from "./runtime/runtimeConfig.ts";
import { setCanvasMode } from "./canvas/canvasStore.ts";
import { isNudgeUiDev, setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import {
  clearClipboardHandoff,
  startClipboardHandoffController,
  subscribeClipboardHandoff,
} from "./prompt/clipboardHandoff.ts";
import {
  createWorkspace,
  InspectorSessionProvider,
  type InspectorSession,
} from "./session/index.ts";

let hostElement: HTMLElement | null = null;
let reactRoot: Root | null = null;
let lockedRoot: Root | null = null;
const workspace = createWorkspace();
let inspectorSession: InspectorSession | null = null;
let listenerAttached = false;
let beforeUnloadAttached = false;
let persistenceSubscribed = false;
let unsubscribeOwnership: (() => void) | null = null;
let removeInspectionBridge: (() => void) | null = null;
let stopClipboardHandoffController: (() => void) | null = null;

function onKeydown(e: KeyboardEvent): void {
  if (isInspectorToggleShortcut(e)) {
    toggleInspector();
    e.preventDefault();
  }
}

function disposeInspectorSession(): void {
  inspectorSession?.dispose();
  inspectorSession = null;
}

export function bootstrapNudgeUi(inspectorHost: HTMLElement): void {
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const explicitDemo = isDemoRuntime();
  if (!isNudgeUiDev() && !explicitDemo) return;

  if (explicitDemo) {
    // ADR-0014: only the configured demo runtime opens the shared dev gate
    // for its own document. The bundle mode name alone must never flip it,
    // so every build without both opt-ins stays governed by ADR-0002.
    setNudgeUiHostDevFlag(true);
    // Public demo builds intentionally expose only the static inspector. The
    // Canvas workspace, write lease, persistence, and agent bridge stay out
    // of the embedded frame.
    setCanvasMode("inspect");
    mountInspector(inspectorHost);
    return;
  }

  if (!runtimeConfig.capabilities.canvas) {
    // A project can be reopened with a runtime that does not expose Canvas.
    // Clear any stale in-memory mode before mounting the static inspector.
    setCanvasMode("inspect");
  }

  removeInspectionBridge?.();
  removeInspectionBridge = installInspectionBridge();

  if (getNudgeUiRuntimeConfig().capabilities.canvas && isCanvasRenderer()) {
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
  stopClipboardHandoffController?.();
  stopClipboardHandoffController = startClipboardHandoffController(document);

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
    subscribeClipboardHandoff(() => scheduleAutoSave());
    subscribeCanvas(() => scheduleCanvasSave());
    persistenceSubscribed = true;
  }
}

function mountLockedNotice(host: HTMLElement): void {
  stopClipboardHandoffController?.();
  stopClipboardHandoffController = null;
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  disposeInspectorSession();
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
  const demo = isDemoRuntime();
  if (!demo && !hasWriteLease()) return;
  if (host.dataset.nudgeUiDebug === "true") {
    const runtimeConfig = getNudgeUiRuntimeConfig();
    if (runtimeConfig.capabilities.domNavigation !== true) {
      configureNudgeUiRuntime({
        ...runtimeConfig,
        capabilities: { ...runtimeConfig.capabilities, domNavigation: true },
      });
    }
  }
  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }
  if (!hostElement) hostElement = host;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    inspectorSession = workspace.createInspectorSession(host);
    setInspectorHost(host);
    reactRoot.render(createElement(
      InspectorSessionProvider,
      { inspector: inspectorSession },
      createElement(demo ? InspectorShell : AppShell),
    ));
  }
  setInspectorOpen(true);
  if (!listenerAttached) {
    window.addEventListener("keydown", onKeydown);
    listenerAttached = true;
  }
}

export function unmountInspector(): void {
  stopClipboardHandoffController?.();
  stopClipboardHandoffController = null;
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
  disposeInspectorSession();
  clearClipboardHandoff();
  removeManagedSheet();
  clearInspectorLayout();
  removeInspectionBridge?.();
  removeInspectionBridge = null;
  hostElement = null;
}

export { toggleInspector, setInspectorOpen } from "./shell/InspectorShell.tsx";
export { InspectorShell } from "./shell/InspectorShell.tsx";
export { detectFramework } from "./prompt/detectFramework.ts";
export {
  installStaticHtmlRuntimeIdentity,
  isRuntimeGeneratedSource,
  RUNTIME_ELEMENT_CID_PREFIX,
  RUNTIME_UNKNOWN_SOURCE_PREFIX,
} from "./runtime/staticHtmlRuntimeIdentity.ts";
export { assertConformanceFixture, runConformanceFixture } from "./conformance/fixture.ts";
export { isCanvasRenderer } from "./canvas/roleDetection.ts";
export { NUDGE_UI_INSPECTION_VERSION, inspectElement, installInspectionBridge } from "./inspection/bridge.ts";
export type { NudgeUiInspectionBridge, ElementInspection, InspectElementOptions, InspectionCatalogEntry, InspectionControl } from "./inspection/bridge.ts";
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
} from "./inline-text/inlineTextEditor.ts";
export type {
  InlineTextEditor,
  InlineTextDiagnostic,
  InlineTextSession,
  InlineTextInputRejectionReason,
  InlineTextSessionEndReason,
  TextBindingCandidate,
  TextEditBinding,
  TextEditRejection,
} from "./inline-text/inlineTextEditor.ts";
export { projectInspectorValues, projectionSides } from "./spacing/projection.ts";
export type { InspectorAxisProjection, InspectorFieldProjection, InspectorProjection, InspectorSpacingProjection, ProjectionAxis, ProjectionGroup, ProjectionSide, ProjectionState } from "./spacing/projection.ts";
export { createBrowserCssInspection } from "./inspection/browserCssInspection.ts";
export {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  normalizeNudgeUiRuntimeConfig,
  subscribeNudgeUiRuntime,
} from "./runtime/runtimeConfig.ts";
export { useNudgeUiRuntimeConfig } from "./runtime/useRuntimeConfig.ts";
export { isNudgeUiDev, setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
export type {
  NudgeUiRuntimeConfig,
  NudgeUiRuntimeCapabilities,
  NudgeUiRuntimeFramework,
  NudgeUiRuntimeHost,
} from "./runtime/runtimeConfig.ts";
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
