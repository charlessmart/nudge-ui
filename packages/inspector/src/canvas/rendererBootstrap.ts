import { PROTOCOL_VERSION, sendToParent, type ParentReadyMessage } from "./frameProtocol.ts";
import type { FrameReadyMessage, FrameMetadataMessage, NavigationIntentMessage } from "./frameProtocol.ts";
import { handleReplaceStyles } from "./rendererStylesheet.ts";
import { findClosestAnchor, isEligibleNavigation, hasDifferentRoute } from "./linkEligibility.ts";

let rendererBootstrapped = false;
let rendererProjectId: string | null = null;
let rendererWorkspaceId: string | null = null;
let rendererCardId: string | null = null;

function sendFrameReady(): void {
  const msg: FrameReadyMessage = {
    type: "frame-ready",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
  };

  sendToParent(msg);
}

function sendFrameMetadata(): void {
  if (!rendererBootstrapped) return;
  const msg: FrameMetadataMessage = {
    type: "frame-metadata",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
  };
  sendToParent(msg);
}

function observeFrameMetadata(): void {
  window.addEventListener("popstate", sendFrameMetadata);
  window.addEventListener("hashchange", sendFrameMetadata);

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

  sendFrameReady();
  observeFrameMetadata();

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      const anchor = findClosestAnchor(event.target);
      if (!anchor) return;
      if (!isEligibleNavigation(anchor, event)) return;
      if (!hasDifferentRoute(anchor)) return;

      event.preventDefault();

      const msg: NavigationIntentMessage = {
        type: "navigation-intent",
        protocolVersion: PROTOCOL_VERSION,
        url: anchor.href,
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
      rendererProjectId = pr.projectId ?? rendererProjectId;
      rendererWorkspaceId = pr.workspaceId ?? rendererWorkspaceId;
      rendererCardId = pr.cardId ?? rendererCardId;
      sendFrameReady();
      return;
    }

    if (
      msg &&
      typeof msg === "object" &&
      msg.type === "replace-styles" &&
      rendererProjectId &&
      rendererWorkspaceId &&
      rendererCardId
    ) {
      handleReplaceStyles(
        msg as Parameters<typeof handleReplaceStyles>[0],
        rendererProjectId,
        rendererWorkspaceId,
        rendererCardId,
      );
    }
  });
}
