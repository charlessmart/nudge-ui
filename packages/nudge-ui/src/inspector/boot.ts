import { startWorkspaceController } from "./workspace/controller.ts";
import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { toggleInspector, setInspectorOpen } from "./shell/openStore.ts";
import { setSelectedElement } from "./selection/selectionStore.ts";
import { removeManagedSheet } from "./projection/managedStylesheet.ts";
import {
  isInspectorToggleShortcut,
  isOriginalPreviewShortcut,
  isolateTypingKeys,
  SEND_PROMPT_HOTKEY_EVENT,
} from "./shell/shortcuts.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";
import { isPageSurface } from "./canvas/pageSurface.ts";
import { claimShortcutKey } from "./canvas/keyboardShortcuts.ts";
import { isKeyboardShortcutMessage, type FrameIdentity } from "./canvas/frameProtocol.ts";
import { subscribeCanvasRendererMessages } from "./canvas/rendererMessageRouter.ts";
import { bootstrapRenderer, type RendererBootstrapHandle } from "./canvas/rendererBootstrap.ts";
import {
  setRestoreCount,
} from "./canvas/sessionStore.ts";
import { getChangesList } from "./drafts/store.ts";
import {
  acquireLease,
  enableWriteGuard,
  hasWriteLease,
  releaseLease,
  subscribeOwnership,
} from "./canvas/workspaceLease.ts";
import { cancelStaleDetection, startStaleDetection } from "./canvas/staleChangeDetector.ts";
import { LockedWorkspaceNotice } from "./canvas/LockedWorkspaceNotice.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { installInspectionBridge } from "./inspection/bridge.ts";
import { releaseDocumentProjection, getStructuralChanges } from "./projection/structuralProjection.ts";
import { cancelInlineTextEdit } from "./inline-text/inlineTextEditor.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig, isDemoRuntime } from "./runtime/runtimeConfig.ts";
import { setCanvasMode } from "./canvas/viewStore.ts";
import { isNudgeUiDev, setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import {
  clearClipboardHandoff,
} from "./prompt/clipboardHandoff.ts";
import {
  createWorkspace,
  InspectorSessionProvider,
  type InspectorSession,
} from "./session/index.ts";
import { cancelSketchInteraction, isSketchInteractionActive } from "./canvas/sketch/interaction.ts";
import { setOriginalPreviewActive } from "./shell/originalPreview.ts";
import { inspectorStorage } from "./runtime/inspectorStorage.ts";
import { disposeRuntimeIdentityClaims } from "./runtime/runtimeIdentityClaims.ts";

let reactRoot: Root | null = null;
let lockedRoot: Root | null = null;
/** Rendered by every mount until the next bootstrap; replaced so tests and embedders can supply a lighter shell. */
let inspectorShell: InspectorShell = AppShell;
const workspace = createWorkspace();
let inspectorSession: InspectorSession | null = null;
let rendererBootstrapHandle: RendererBootstrapHandle | null = null;
let workspaceController: ReturnType<typeof startWorkspaceController> | null = null;
let unsubscribeOwnership: (() => void) | null = null;
let removeInspectionBridge: (() => void) | null = null;
let controllerStartId = 0;

let keyboardPeekHeld = false;

function onKeydown(e: KeyboardEvent): void {
  if (isSketchInteractionActive()) return;
  if (isInspectorToggleShortcut(e)) {
    toggleInspector();
    claimShortcutKey(e, { always: true });
    return;
  }
  if (isOriginalPreviewShortcut(e)) {
    keyboardPeekHeld = true;
    setOriginalPreviewActive(true);
    claimShortcutKey(e);
  }
}

function onKeyup(e: KeyboardEvent): void {
  // Release only a keyboard-started peek so a button-held preview survives unrelated Backslash keyups.
  if (e.code === "Backslash" && keyboardPeekHeld) {
    keyboardPeekHeld = false;
    setOriginalPreviewActive(false);
  }
}

function onRendererKeyboardShortcut(message: unknown, identity: FrameIdentity): void {
  if (!isKeyboardShortcutMessage(message, identity)) return;
  if (message.code === "KeyS" && message.phase === "keydown") {
    window.dispatchEvent(new Event(SEND_PROMPT_HOTKEY_EVENT));
    return;
  }
  if (message.code !== "Backslash") return;
  if (message.phase === "keydown") {
    keyboardPeekHeld = true;
    setOriginalPreviewActive(true);
  } else if (keyboardPeekHeld) {
    keyboardPeekHeld = false;
    setOriginalPreviewActive(false);
  }
}

function disposeInspectorSession(): void {
  const session = inspectorSession;
  inspectorSession = null;
  session?.dispose();
}

export type InspectorShell = () => ReactElement;

export function bootstrapNudgeUi(inspectorHost: HTMLElement, shell: InspectorShell = AppShell): void {
  inspectorShell = shell;
  controllerStartId += 1;
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const explicitDemo = isDemoRuntime();
  if (!isNudgeUiDev() && !explicitDemo) return;

  if (explicitDemo) {
    rendererBootstrapHandle?.teardown();
    rendererBootstrapHandle = null;
    // Only the configured demo runtime may open the shared dev gate; the bundle mode name alone must not.
    setNudgeUiHostDevFlag(true);
    if (runtimeConfig.capabilities.canvas && isCanvasRenderer()) {
      rendererBootstrapHandle = bootstrapRenderer() ?? null;
      return;
    }
    // The public demo shares the iframe editor without the write lease, persistence, or agent bridge.
    setCanvasMode("canvas");
    workspaceController?.dispose();
    workspaceController = startWorkspaceController();
    mountInspector(inspectorHost);
    setInspectorOpen(false);
    return;
  }

  if (!runtimeConfig.capabilities.canvas) {
    // Clear a stale in-memory Canvas mode when the runtime does not expose Canvas.
    setCanvasMode("inspect");
  }

  rendererBootstrapHandle?.teardown();
  rendererBootstrapHandle = null;

  removeInspectionBridge?.();
  removeInspectionBridge = installInspectionBridge();

  if (getNudgeUiRuntimeConfig().capabilities.canvas && isCanvasRenderer()) {
    rendererBootstrapHandle = bootstrapRenderer() ?? null;
    return;
  }

  enableWriteGuard();
  const leaseGranted = acquireLease();
  if (!leaseGranted) {
    mountLockedNotice(inspectorHost);
    return;
  }

  void startController(inspectorHost);
}

async function startController(inspectorHost: HTMLElement): Promise<void> {
  const startId = ++controllerStartId;
  if (!hasWriteLease()) {
    mountLockedNotice(inspectorHost);
    return;
  }

  // Refresh ownership before hydration writes so the previous tab cannot save after this snapshot.
  try {
    const storage = inspectorStorage();
    if (storage?.refresh) await storage.refresh();
  } catch {
    if (startId !== controllerStartId) return;
    releaseLease();
    mountLockedNotice(inspectorHost, true);
    return;
  }
  if (startId !== controllerStartId) return;
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
    if (!hasLease) { workspaceController?.dispose(); workspaceController = null; mountLockedNotice(inspectorHost); }
  });

  workspaceController?.dispose();
  const result = startWorkspaceController();
  workspaceController = result;
  if (result.restored) {
    setRestoreCount(getChangesList().length + getStructuralChanges().length);
    const restored = getChangesList();
    if (restored.length > 0) {
      startStaleDetection(restored);
    }
  }
  if (getNudgeUiRuntimeConfig().capabilities.canvas) {
    // Hydration runs first so switching to Canvas mode cannot discard cards, camera, or edits.
    setCanvasMode("canvas");
  }

  mountInspector(inspectorHost);
  if (getNudgeUiRuntimeConfig().capabilities.canvas && isPageSurface()) {
    rendererBootstrapHandle = bootstrapRenderer() ?? null;
  }
}

function mountLockedNotice(host: HTMLElement, storageError = false): void {
  controllerStartId += 1;
  // The page-surface renderer holds the Inspection tool's speed and views; with no toolbar left, they must not linger.
  rendererBootstrapHandle?.teardown();
  rendererBootstrapHandle = null;
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  try {
    disposeInspectorSession();
  } finally {
    cancelStaleDetection();
    setInspectorOpen(false);
    cancelInlineTextEdit();
    cancelSketchInteraction();
    setSelectedElement(null);
    removeManagedSheet();
    disposeRuntimeIdentityClaims(document);
    releaseDocumentProjection(document);
    unsubscribeOwnership?.();
    unsubscribeOwnership = null;
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!lockedRoot) {
    lockedRoot = createRoot(shadow);
  }
  lockedRoot.render(createElement(LockedWorkspaceNotice, {
    onTakeover: () => startController(host),
    storageError,
  }));
}

export function mountInspector(host: HTMLElement): void {
  const demo = isDemoRuntime();
  if (!demo && !hasWriteLease()) return;
  const runtimeConfig = getNudgeUiRuntimeConfig();
  if (runtimeConfig.capabilities.domNavigation !== true) {
    configureNudgeUiRuntime({
      ...runtimeConfig,
      capabilities: { ...runtimeConfig.capabilities, domNavigation: true },
    });
  }
  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    inspectorSession = workspace.createInspectorSession(host);
    inspectorSession.registerCleanup(() => window.removeEventListener("keydown", onKeydown, true));
    inspectorSession.registerCleanup(() => window.removeEventListener("keyup", onKeyup, true));
    inspectorSession.registerCleanup(isolateTypingKeys(shadow));
    inspectorSession.registerCleanup(subscribeCanvasRendererMessages(({ frame, message }) => {
      onRendererKeyboardShortcut(message, frame.identity);
    }));
    reactRoot.render(createElement(
      InspectorSessionProvider,
      { inspector: inspectorSession, documentSession: null },
      createElement(inspectorShell),
    ));
    // Captured on the window, ahead of the page's own shortcuts, so a page can't swallow them.
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keyup", onKeyup, true);
  }
  setInspectorOpen(true);
}

export function unmountInspector(): void {
  controllerStartId += 1;
  rendererBootstrapHandle?.teardown();
  rendererBootstrapHandle = null;
  workspaceController?.dispose();
  workspaceController = null;
  unsubscribeOwnership?.();
  unsubscribeOwnership = null;
  if (lockedRoot) {
    lockedRoot.unmount();
    lockedRoot = null;
  }
  cancelStaleDetection();
  cancelInlineTextEdit();
  cancelSketchInteraction();
  setSelectedElement(null);
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  try {
    disposeInspectorSession();
  } finally {
    // Release directly too, so projection applied outside a session cannot leak across unmount.
    disposeRuntimeIdentityClaims(document);
    releaseDocumentProjection(document);
    clearClipboardHandoff();
    removeManagedSheet();
    removeInspectionBridge?.();
    removeInspectionBridge = null;
  }
}
