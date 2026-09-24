import {
  PROTOCOL_VERSION,
  clearRendererIdentity,
  getRendererIdentity,
  isRendererMessageFor,
  sendToParent,
  setRendererIdentity,
  type ParentReadyMessage,
  type BoardGestureStateMessage,
} from "./frameProtocol.ts";
import type {
  FrameMetadataMessage,
  FrameReadyMessage,
  FrameRuntimeMessage,
  LinkTargetStateMessage,
  NavigationIntentMessage,
  PanEndMessage,
  PanModifierMessage,
  PanMoveMessage,
  PanStartMessage,
  RendererHelloMessage,
  ZoomMessage,
} from "./frameProtocol.ts";
import { handleReplaceStyles, startRendererProjectionDiagnostics } from "./rendererStylesheet.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";
import { installRendererElementSelector } from "./rendererElementSelector.ts";
import { createFrameThrottle } from "../overlay/frameThrottle.ts";
import { isNudgeUiDev } from "../runtime/devFlag.ts";
import { getNudgeUiRuntimeConfig, subscribeNudgeUiRuntime } from "../runtime/runtimeConfig.ts";

export interface RendererBootstrapHandle {
  teardown(): void;
}

interface CancellableFrameThrottle {
  cancel(): void;
}

interface RendererBootstrapOwner {
  active: boolean;
  listenerRemovers: Array<() => void>;
  resourceDisposers: Array<() => void>;
  observers: MutationObserver[];
  timers: Set<number>;
  frameThrottles: CancellableFrameThrottle[];
  historyPatchRestorers: Array<() => void>;
}

interface ActiveRendererBootstrap {
  owner: RendererBootstrapOwner;
  handle: RendererBootstrapHandle;
}

let activeRendererBootstrap: ActiveRendererBootstrap | null = null;

function ownsRendererBootstrap(owner: RendererBootstrapOwner): boolean {
  return owner.active && activeRendererBootstrap?.owner === owner;
}

function sendFrameReady(owner: RendererBootstrapOwner): void {
  if (!ownsRendererBootstrap(owner)) return;
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: FrameReadyMessage = {
    type: "frame-ready",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
    runtime: getNudgeUiRuntimeConfig(),
    ...identity,
  };

  sendToParent(msg);
}

function sendFrameRuntime(owner: RendererBootstrapOwner): void {
  if (!ownsRendererBootstrap(owner)) return;
  const identity = getRendererIdentity();
  if (!identity) return;
  const message: FrameRuntimeMessage = {
    type: "frame-runtime",
    protocolVersion: PROTOCOL_VERSION,
    runtime: getNudgeUiRuntimeConfig(),
    ...identity,
  };
  sendToParent(message);
}

function sendFrameMetadata(owner: RendererBootstrapOwner): void {
  if (!ownsRendererBootstrap(owner)) return;
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: FrameMetadataMessage = {
    type: "frame-metadata",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
    ...identity,
  };
  sendToParent(msg);
}

function observeFrameMetadata(owner: RendererBootstrapOwner): void {
  const onPopState = (): void => sendFrameMetadata(owner);
  window.addEventListener("popstate", onPopState);
  owner.listenerRemovers.push(() => window.removeEventListener("popstate", onPopState));

  const onHashChange = (): void => sendFrameMetadata(owner);
  window.addEventListener("hashchange", onHashChange);
  owner.listenerRemovers.push(() => window.removeEventListener("hashchange", onHashChange));

  for (const method of ["pushState", "replaceState"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(history, method);
    const original = history[method];
    const patched = function (
      this: History,
      ...args: Parameters<typeof original>
    ): ReturnType<typeof original> {
      const result = original.apply(this, args);
      if (ownsRendererBootstrap(owner)) {
        queueMicrotask(() => sendFrameMetadata(owner));
      }
      return result;
    } as typeof original;
    history[method] = patched;
    owner.historyPatchRestorers.push(() => {
      if (history[method] === patched) {
        if (descriptor) {
          Object.defineProperty(history, method, descriptor);
        } else {
          delete history[method];
        }
      }
    });
  }

  const titleEl = document.querySelector("title");
  if (titleEl) {
    const observer = new MutationObserver(() => sendFrameMetadata(owner));
    observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
    owner.observers.push(observer);
  }
}

function scheduleRendererTimer(
  owner: RendererBootstrapOwner,
  callback: () => void,
  delay: number,
): void {
  const timer = window.setTimeout(() => {
    owner.timers.delete(timer);
    if (!ownsRendererBootstrap(owner)) return;
    callback();
  }, delay);
  owner.timers.add(timer);
}

function teardownRenderer(owner: RendererBootstrapOwner): void {
  if (!owner.active) return;

  // Invalidate callbacks before releasing any resource. A queued microtask or
  // frame can still run after its source has been cancelled.
  owner.active = false;
  if (activeRendererBootstrap?.owner === owner) {
    activeRendererBootstrap = null;
  }

  for (const timer of owner.timers) window.clearTimeout(timer);
  owner.timers.clear();

  for (const throttle of owner.frameThrottles) throttle.cancel();
  owner.frameThrottles.length = 0;

  for (const observer of owner.observers) observer.disconnect();
  owner.observers.length = 0;

  for (const removeListener of owner.listenerRemovers.splice(0)) removeListener();
  for (const disposeResource of owner.resourceDisposers.splice(0)) disposeResource();
  for (const restoreHistoryPatch of owner.historyPatchRestorers.splice(0)) restoreHistoryPatch();
  clearRendererIdentity();
}

export function bootstrapRenderer(): RendererBootstrapHandle | undefined {
  if (!getNudgeUiRuntimeConfig().capabilities.canvas) return;
  if (!isNudgeUiDev()) return;
  if (activeRendererBootstrap) return activeRendererBootstrap.handle;

  const owner: RendererBootstrapOwner = {
    active: true,
    listenerRemovers: [],
    resourceDisposers: [],
    observers: [],
    timers: new Set(),
    frameThrottles: [],
    historyPatchRestorers: [],
  };
  const handle: RendererBootstrapHandle = {
    teardown: () => teardownRenderer(owner),
  };
  activeRendererBootstrap = { owner, handle };

  try {
    observeFrameMetadata(owner);
    owner.resourceDisposers.push(subscribeNudgeUiRuntime(() => sendFrameRuntime(owner)));
    const disposeDiagnostics = startRendererProjectionDiagnostics();
    if (disposeDiagnostics) owner.resourceDisposers.push(disposeDiagnostics);
    const disposeSelector = installRendererElementSelector();
    if (disposeSelector) owner.resourceDisposers.push(disposeSelector);
    installRendererPanProxy(owner);

    let openLinksInCards = false;
    const onClick = (event: MouseEvent): void => {
      if (!ownsRendererBootstrap(owner)) return;
      const anchor = findClosestAnchor(event.target);
      if (!anchor) return;
      if (!isEligibleNavigation(anchor, event)) return;
      if (!hasDifferentRoute(anchor)) return;

      const identity = getRendererIdentity();
      if (!identity) return;

      if (openLinksInCards) {
        // Capture on document runs before framework routers, so the card keeps its route.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      const msg: NavigationIntentMessage = {
        type: "navigation-intent",
        protocolVersion: PROTOCOL_VERSION,
        url: anchor.href,
        ...(openLinksInCards ? { openInCard: true } : {}),
        ...identity,
      };
      sendToParent(msg);
    };
    document.addEventListener("click", onClick, true);
    owner.listenerRemovers.push(() => document.removeEventListener("click", onClick, true));

    const onMessage = (event: MessageEvent): void => {
      if (!ownsRendererBootstrap(owner)) return;
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;
      const msg = event.data;

      if (msg && typeof msg === "object" && msg.type === "parent-ready") {
        if (typeof msg.protocolVersion !== "number" || msg.protocolVersion !== PROTOCOL_VERSION) return;
        const pr = msg as ParentReadyMessage;
        setRendererIdentity({
          projectId: pr.projectId,
          workspaceId: pr.workspaceId,
          cardId: pr.cardId,
        });
        sendFrameReady(owner);
        return;
      }

      const frameIdentity = getRendererIdentity();
      if (frameIdentity && isRendererMessageFor(msg, frameIdentity) && msg.type === "link-target-state") {
        // SAFETY: the identity check proves a protocol message; the discriminator selects this shape.
        openLinksInCards = (msg as LinkTargetStateMessage).openInCard === true;
        return;
      }

      if (
        msg &&
        typeof msg === "object" &&
        msg.type === "replace-styles" &&
        getRendererIdentity()
      ) {
        const identity = getRendererIdentity()!;
        handleReplaceStyles(
          msg as Parameters<typeof handleReplaceStyles>[0],
          identity.projectId,
          identity.workspaceId,
          identity.cardId,
        );
      }
    };
    window.addEventListener("message", onMessage);
    owner.listenerRemovers.push(() => window.removeEventListener("message", onMessage));

    // Solicit the handshake, then retry briefly. The controller answers on
    // iframe load AND on every hello it receives, but its answering listener
    // attaches when the card component commits — normally long before any
    // renderer finishes booting. The retries cover the residual window where
    // a renderer's listeners go live before the controller's do (fast boot,
    // slow controller compile). Every path is idempotent: setRendererIdentity
    // overwrites, re-registration replaces, projection re-sends are safe.
    let helloAttempts = 0;
    const solicitHandshake = (): void => {
      if (!ownsRendererBootstrap(owner) || getRendererIdentity() || helloAttempts >= 5) return;
      helloAttempts += 1;
      const hello: RendererHelloMessage = {
        type: "renderer-hello",
        protocolVersion: PROTOCOL_VERSION,
      };
      sendToParent(hello);
      scheduleRendererTimer(owner, solicitHandshake, 400 * helloAttempts);
    };
    solicitHandshake();
  } catch (error) {
    teardownRenderer(owner);
    throw error;
  }

  return handle;
}

function installRendererPanProxy(owner: RendererBootstrapOwner): void {
  let spaceHeld = false;
  let panning = false;
  let boardGesturesEnabled = false;

  const panMoveUpdate = createFrameThrottle((point: { x: number; y: number }) => {
    if (!ownsRendererBootstrap(owner)) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    const message: PanMoveMessage = {
      type: "pan-move",
      protocolVersion: PROTOCOL_VERSION,
      point,
      ...identity,
    };
    sendToParent(message);
  });
  owner.frameThrottles.push(panMoveUpdate);

  function isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  }

  function sendSpaceState(): void {
    if (!ownsRendererBootstrap(owner)) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    const message: PanModifierMessage = {
      type: "pan-modifier",
      protocolVersion: PROTOCOL_VERSION,
      spaceHeld,
      ...identity,
    };
    sendToParent(message);
  }

  const onMessage = (event: MessageEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const identity = getRendererIdentity();
    if (!identity || !isRendererMessageFor(event.data, identity)) return;
    if ((event.data as PanModifierMessage).type === "pan-modifier") {
      spaceHeld = (event.data as PanModifierMessage).spaceHeld;
    }
    if ((event.data as BoardGestureStateMessage).type === "board-gesture-state") {
      boardGesturesEnabled = (event.data as BoardGestureStateMessage).enabled;
      if (!boardGesturesEnabled) {
        spaceHeld = false;
        endPan();
      }
    }
  };
  window.addEventListener("message", onMessage);
  owner.listenerRemovers.push(() => window.removeEventListener("message", onMessage));

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (boardGesturesEnabled && event.code === "Space" && !event.repeat && !isEditableTarget(event.target)) {
      spaceHeld = true;
      if (getRendererIdentity()) event.preventDefault();
      sendSpaceState();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  owner.listenerRemovers.push(() => window.removeEventListener("keydown", onKeyDown, true));

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (event.code === "Space") {
      spaceHeld = false;
      sendSpaceState();
    }
  };
  window.addEventListener("keyup", onKeyUp, true);
  owner.listenerRemovers.push(() => window.removeEventListener("keyup", onKeyUp, true));

  function endPan(): void {
    if (!ownsRendererBootstrap(owner)) {
      panMoveUpdate.cancel();
      panning = false;
      return;
    }
    if (!panning) {
      panMoveUpdate.cancel();
      return;
    }
    // Pointer-up can arrive before the next animation frame. Deliver the
    // latest point before pan-end so the final drag position is not lost.
    panMoveUpdate.flush();
    panning = false;
    const identity = getRendererIdentity();
    if (!identity) return;
    const message: PanEndMessage = {
      type: "pan-end",
      protocolVersion: PROTOCOL_VERSION,
      ...identity,
    };
    sendToParent(message);
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (!boardGesturesEnabled || !spaceHeld || event.button !== 0 || isEditableTarget(event.target)) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    panning = true;
    event.preventDefault();
    const target = event.target;
    if (target instanceof HTMLElement) target.setPointerCapture?.(event.pointerId);
    const message: PanStartMessage = {
      type: "pan-start",
      protocolVersion: PROTOCOL_VERSION,
      point: { x: event.clientX, y: event.clientY },
      ...identity,
    };
    sendToParent(message);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  owner.listenerRemovers.push(() => document.removeEventListener("pointerdown", onPointerDown, true));

  const onPointerMove = (event: PointerEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (!panning) return;
    event.preventDefault();
    panMoveUpdate.schedule({ x: event.clientX, y: event.clientY });
  };
  document.addEventListener("pointermove", onPointerMove, true);
  owner.listenerRemovers.push(() => document.removeEventListener("pointermove", onPointerMove, true));

  document.addEventListener("pointerup", endPan, true);
  owner.listenerRemovers.push(() => document.removeEventListener("pointerup", endPan, true));
  document.addEventListener("pointercancel", endPan, true);
  owner.listenerRemovers.push(() => document.removeEventListener("pointercancel", endPan, true));

  const onBlur = (): void => {
    if (!ownsRendererBootstrap(owner)) return;
    spaceHeld = false;
    sendSpaceState();
    endPan();
  };
  window.addEventListener("blur", onBlur);
  owner.listenerRemovers.push(() => window.removeEventListener("blur", onBlur));

  const onWheel = (event: WheelEvent): void => {
    if (!ownsRendererBootstrap(owner)) return;
    if (!boardGesturesEnabled || (!event.ctrlKey && !event.metaKey)) return;
    const identity = getRendererIdentity();
    if (!identity) return;
    event.preventDefault();
    event.stopPropagation();
    const message: ZoomMessage = {
      type: "zoom",
      protocolVersion: PROTOCOL_VERSION,
      deltaY: event.deltaY,
      point: { x: event.clientX, y: event.clientY },
      ...identity,
    };
    sendToParent(message);
  };
  const wheelOptions = { capture: true, passive: false };
  window.addEventListener("wheel", onWheel, wheelOptions);
  owner.listenerRemovers.push(() => window.removeEventListener("wheel", onWheel, wheelOptions));
}
