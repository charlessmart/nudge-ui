import { PROTOCOL_VERSION, sendToParent } from "./frameProtocol.ts";
import type { FrameReadyMessage } from "./frameProtocol.ts";

let rendererBootstrapped = false;

function sendFrameReady(): void {
  const msg: FrameReadyMessage = {
    type: "frame-ready",
    protocolVersion: PROTOCOL_VERSION,
    url: window.location.href,
    title: document.title,
  };

  sendToParent(msg);
}

export function bootstrapRenderer(): void {
  if (rendererBootstrapped) return;
  rendererBootstrapped = true;

  if (!import.meta.env.DEV) return;

  sendFrameReady();

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (msg && typeof msg === "object" && msg.type === "parent-ready") {
      sendFrameReady();
    }
  });
}
