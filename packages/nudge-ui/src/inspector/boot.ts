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
  COPY_PROMPT_HOTKEY_EVENT,
  isolateTypingKeys,
} from "./shell/shortcuts.ts";
import { isolateInspectorWheel } from "./shell/scrollIsolation.ts";
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
  watchForTakeover,
} from "./canvas/workspaceLease.ts";
import { cancelStaleDetection, startStaleDetection } from "./canvas/staleChangeDetector.ts";
import { StorageErrorNotice } from "./canvas/StorageErrorNotice.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { installInspectionBridge } from "./inspection/bridge.ts";
import { releaseDocumentProjection, getStructuralChanges } from "./projection/structuralProjection.ts";
import { cancelInlineTextEdit } from "./inline-text/inlineTextEditor.ts";
import { getNudgeUiRuntimeConfig, isDemoRuntime } from "./runtime/runtimeConfig.ts";
import { consumeDemoOpenPanelIntent, markDocumentNoindex } from "./demoEditor.ts";
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
import { registerPaintedValueProbeRoot } from "./tokens/resolution/paintedValueProbe.ts";

let reactRoot: Root | null = null;
let noticeRoot: Root | null = null;
/** Rendered by every mount until the next bootstrap; replaced so tests and embedders can supply a lighter shell. */
let inspectorShell: InspectorShell = AppShell;
const workspace = createWorkspace();
let inspectorSession: InspectorSession | null = null;
let rendererBootstrapHandle: RendererBootstrapHandle | null = null;
let workspaceController: ReturnType<typeof startWorkspaceController> | null = null;
let unsubscribeOwnership: (() => void) | null = null;
let stopTakeoverWatch: (() => void) | null = null;
let inactiveHost: HTMLElement | null = null;
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
    window.dispatchEvent(new Event(COPY_PROMPT_HOTKEY_EVENT));
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
    if (isCanvasRenderer()) {
      rendererBootstrapHandle = bootstrapRenderer() ?? null;
      return;
    }
    // The public demo shares the iframe editor without the write lease or persistence.
    workspaceController?.dispose();
    workspaceController = startWorkspaceController();
    markDocumentNoindex();
    mountInspector(inspectorHost, { open: consumeDemoOpenPanelIntent() });
    return;
  }

  rendererBootstrapHandle?.teardown();
  rendererBootstrapHandle = null;

  removeInspectionBridge?.();
  removeInspectionBridge = installInspectionBridge();

  if (isCanvasRenderer()) {
    rendererBootstrapHandle = bootstrapRenderer() ?? null;
    return;
  }

  enableWriteGuard();
  const leaseGranted = acquireLease();
  if (!leaseGranted) {
    deactivateWorkspace(inspectorHost);
    return;
  }

  void startController(inspectorHost);
}

async function startController(inspectorHost: HTMLElement): Promise<void> {
  const startId = ++controllerStartId;
  stopTakeoverWatch?.();
  stopTakeoverWatch = null;
  if (!hasWriteLease()) {
    deactivateWorkspace(inspectorHost);
    return;
  }

  // Refresh ownership before hydration writes so the previous tab cannot save after this snapshot.
  try {
    const storage = inspectorStorage();
    if (storage?.refresh) await storage.refresh();
  } catch {
    if (startId !== controllerStartId) return;
    releaseLease();
    mountStorageErrorNotice(inspectorHost);
    return;
  }
  if (startId !== controllerStartId) return;
  if (!hasWriteLease()) {
    deactivateWorkspace(inspectorHost);
    return;
  }

  unmountNotice();
  clearInactiveMarker();

  unsubscribeOwnership?.();
  unsubscribeOwnership = subscribeOwnership((hasLease) => {
    if (!hasLease) deactivateWorkspace(inspectorHost);
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
  mountInspector(inspectorHost);
  if (isPageSurface()) {
    rendererBootstrapHandle = bootstrapRenderer() ?? null;
  }
}

/** Marks the host while another tab owns the workspace, so tests and embedders can tell it from not-yet-booted. */
const INACTIVE_DATASET_KEY = "nudgeWorkspace";

function clearInactiveMarker(): void {
  if (inactiveHost) delete inactiveHost.dataset[INACTIVE_DATASET_KEY];
  inactiveHost = null;
}

function unmountNotice(): void {
  noticeRoot?.unmount();
  noticeRoot = null;
}

/**
 * Another tab owns the workspace: hide the inspector and hand ownership back the next
 * time the person comes to this tab. Takeover re-reads storage, so nothing is overwritten.
 */
function deactivateWorkspace(host: HTMLElement): void {
  workspaceController?.dispose();
  workspaceController = null;
  teardownWorkspaceSurface();
  unmountNotice();
  host.dataset[INACTIVE_DATASET_KEY] = "inactive";
  inactiveHost = host;
  stopTakeoverWatch?.();
  stopTakeoverWatch = watchForTakeover(() => {
    stopTakeoverWatch = null;
    void startController(host);
  });
}

function mountStorageErrorNotice(host: HTMLElement): void {
  teardownWorkspaceSurface();
  clearInactiveMarker();
  stopTakeoverWatch?.();
  stopTakeoverWatch = null;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!noticeRoot) {
    noticeRoot = createRoot(shadow);
  }
  noticeRoot.render(createElement(StorageErrorNotice, {
    onRetry: () => startController(host),
  }));
}

function teardownWorkspaceSurface(): void {
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
}

export function mountInspector(host: HTMLElement, options: { readonly open?: boolean } = {}): void {
  const demo = isDemoRuntime();
  if (!demo && !hasWriteLease()) return;
  unmountNotice();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  if (!reactRoot) {
    reactRoot = createRoot(shadow);
    inspectorSession = workspace.createInspectorSession(host);
    inspectorSession.registerCleanup(() => window.removeEventListener("keydown", onKeydown, true));
    inspectorSession.registerCleanup(() => window.removeEventListener("keyup", onKeyup, true));
    inspectorSession.registerCleanup(isolateTypingKeys(shadow));
    inspectorSession.registerCleanup(registerPaintedValueProbeRoot(document, shadow));
    // A page inspected in place can cancel wheel events on its document; the inspector still scrolls.
    if (isPageSurface()) inspectorSession.registerCleanup(isolateInspectorWheel(shadow));
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
  setInspectorOpen(options.open ?? true);
}

export function unmountInspector(): void {
  controllerStartId += 1;
  rendererBootstrapHandle?.teardown();
  rendererBootstrapHandle = null;
  workspaceController?.dispose();
  workspaceController = null;
  unsubscribeOwnership?.();
  unsubscribeOwnership = null;
  stopTakeoverWatch?.();
  stopTakeoverWatch = null;
  unmountNotice();
  clearInactiveMarker();
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
