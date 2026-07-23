import {
  PROTOCOL_VERSION,
  getRendererIdentity,
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
  PanMoveMessage,
  PanStartMessage,
} from "./frameProtocol.ts";
import { handleReplaceStyles } from "./rendererStylesheet.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";
import { installRendererElementSelector } from "./rendererElementSelector.ts";

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
  if (rendererBootstrapped) return;
  rendererBootstrapped = true;

  if (!import.meta.env.DEV) return;

  observeFrameMetadata();
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

  function isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && !isEditableTarget(event.target)) {
      spaceHeld = true;
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") spaceHeld = false;
  });
  function endPan(): void {
    if (!panning) return;
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
    const identity = getRendererIdentity();
    if (!identity) return;
    event.preventDefault();
    const message: PanMoveMessage = {
      type: "pan-move",
      protocolVersion: PROTOCOL_VERSION,
      point: { x: event.clientX, y: event.clientY },
      ...identity,
    };
    sendToParent(message);
  }, true);
  document.addEventListener("pointerup", endPan, true);
  document.addEventListener("pointercancel", endPan, true);
  window.addEventListener("blur", () => {
    spaceHeld = false;
    endPan();
  });
}
