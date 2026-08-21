import {
  PROTOCOL_VERSION,
  getRendererIdentity,
  isRendererMessageFor,
  sendToParent,
  setRendererIdentity,
  type ParentReadyMessage,
} from "./frameProtocol.ts";
import type {
  ExternalNavigationMessage,
  FrameMetadataMessage,
  FrameReadyMessage,
  NavigationIntentMessage,
  PanEndMessage,
  PanModifierMessage,
  PanMoveMessage,
  PanStartMessage,
  ZoomMessage,
} from "./frameProtocol.ts";
import { handleReplaceStyles, startRendererProjectionDiagnostics } from "./rendererStylesheet.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";
import { installRendererElementSelector } from "./rendererElementSelector.ts";
import { createFrameThrottle } from "../frameThrottle.ts";
import { getDesignToolRuntimeConfig } from "../runtimeConfig.ts";

let rendererBootstrapped = false;
function sendFrameReady(): void {
  const identity = getRendererIdentity();
  if (!identity) return;
  const msg: FrameReadyMessage = {
    type: "frame-ready",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
    ...identity,
  };

  sendToParent(msg);
}

function sendFrameMetadata(): void {
  const identity = getRendererIdentity();
  if (!rendererBootstrapped || !identity) return;
  const msg: FrameMetadataMessage = {
    type: "frame-metadata",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
    ...identity,
  };
  sendToParent(msg);
}

function observeFrameMetadata(): void {
  window.addEventListener("popstate", sendFrameMetadata);
  window.addEventListener("hashchange", sendFrameMetadata);

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>): ReturnType<History[typeof method]> {
      const result = original.apply(this, args);
      queueMicrotask(sendFrameMetadata);
      return result;
    };
  }

  const titleEl = document.querySelector("title");
  if (titleEl) {
    const observer = new MutationObserver(sendFrameMetadata);
    observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
  }
}

export function bootstrapRenderer(): void {
  if (!getDesignToolRuntimeConfig().capabilities.canvas) return;
  if (rendererBootstrapped) return;
  rendererBootstrapped = true;

  if (!import.meta.env.DEV) return;

  observeFrameMetadata();
  startRendererProjectionDiagnostics();
  installRendererElementSelector();
  installRendererPanProxy();

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      const anchor = findClosestAnchor(event.target);
      if (!anchor) return;
      if (!isEligibleNavigation(anchor, event)) {
        if (isPrimarySelfNavigation(anchor, event)) {
          event.preventDefault();
          const identity = getRendererIdentity();
          if (!identity) return;
          const msg: ExternalNavigationMessage = {
            type: "external-navigation",
            protocolVersion: PROTOCOL_VERSION,
            url: anchor.href,
            ...identity,
          };
          sendToParent(msg);
        }
        return;
      }
      if (!hasDifferentRoute(anchor)) return;

      event.preventDefault();
      const identity = getRendererIdentity();
      if (!identity) return;

      const msg: NavigationIntentMessage = {
        type: "navigation-intent",
        protocolVersion: PROTOCOL_VERSION,
        url: anchor.href,
        ...identity,
      };
      sendToParent(msg);
    },
    true,
  );

  window.addEventListener("message", (event) => {
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
      sendFrameReady();
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
  });
}

function isPrimarySelfNavigation(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return false;
  return anchor.protocol === "http:" || anchor.protocol === "https:";
}

function installRendererPanProxy(): void {
  let spaceHeld = false;
  let panning = false;

  const panMoveUpdate = createFrameThrottle((point: { x: number; y: number }) => {
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

  function isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  }

  function sendSpaceState(): void {
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

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const identity = getRendererIdentity();
    if (!identity || !isRendererMessageFor(event.data, identity)) return;
    if ((event.data as PanModifierMessage).type === "pan-modifier") {
      spaceHeld = (event.data as PanModifierMessage).spaceHeld;
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && !isEditableTarget(event.target)) {
      spaceHeld = true;
      if (getRendererIdentity()) event.preventDefault();
      sendSpaceState();
    }
  }, true);
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spaceHeld = false;
      sendSpaceState();
    }
  }, true);
  function endPan(): void {
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
  document.addEventListener("pointerdown", (event) => {
    if (!spaceHeld || event.button !== 0 || isEditableTarget(event.target)) return;
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
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!panning) return;
    event.preventDefault();
    panMoveUpdate.schedule({ x: event.clientX, y: event.clientY });
  }, true);
  document.addEventListener("pointerup", endPan, true);
  document.addEventListener("pointercancel", endPan, true);
  window.addEventListener("blur", () => {
    spaceHeld = false;
    sendSpaceState();
    endPan();
  });

  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
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
  }, { capture: true, passive: false });
}
