import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { PROTOCOL_VERSION, type ElementHoverMessage, type ElementClickMessage } from "./frameProtocol.ts";
import { getRegisteredFrames } from "./projection.ts";
import { getBoardCamera } from "./canvasStore.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";
import overlayStyles from "./CanvasElementOverlay.css?inline";

interface HoverState {
  left: number;
  top: number;
  width: number;
  height: number;
  cardId: string;
}

export function CanvasElementOverlay(): ReactElement | null {
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      if (typeof event.data.protocolVersion !== "number" || event.data.protocolVersion !== PROTOCOL_VERSION) return;

      const frames = getRegisteredFrames();
      let sourceCardId: string | null = null;
      let sourceIframe: HTMLIFrameElement | null = null;
      for (const [cardId, iframe] of frames) {
        if (iframe.contentWindow === event.source) {
          sourceCardId = cardId;
          sourceIframe = iframe;
          break;
        }
      }
      if (!sourceCardId || !sourceIframe) return;

      if (event.data.type === "element-hover") {
        const msg = event.data as ElementHoverMessage;
        if (!msg.cid) return;

        if (msg.rect === null) {
          setHover((current) => {
            if (current && current.cardId === sourceCardId) return null;
            return current;
          });
          return;
        }

        const iframeRect = sourceIframe.getBoundingClientRect();
        const zoom = getBoardCamera().zoom;
        setHover({
          left: iframeRect.left + msg.rect.left * zoom,
          top: iframeRect.top + msg.rect.top * zoom,
          width: msg.rect.width * zoom,
          height: msg.rect.height * zoom,
          cardId: sourceCardId,
        });
      } else if (event.data.type === "element-click") {
        const msg = event.data as ElementClickMessage;
        if (!msg.cid) return;
        handleElementClick(msg, sourceIframe, sourceCardId);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!hover) return null;

  const style: CSSProperties = {
    position: "fixed",
    left: hover.left,
    top: hover.top,
    width: hover.width,
    height: hover.height,
    pointerEvents: "none",
    zIndex: 3,
  };

  return (
    <>
      <style data-test="canvas-element-overlay-styles">{overlayStyles}</style>
      <div className="dt-canvas-element-overlay" style={style} aria-hidden="true" />
    </>
  );
}
