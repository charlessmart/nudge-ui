import { useEffect, useRef, useState, type ReactElement } from "react";
import type { CanvasCard } from "./canvasStore.ts";
import { connectFrame } from "./frameConnection.ts";
import { contentSourceUrl } from "./frameContent.ts";
import { getPageFrame } from "./pageSurface.ts";
import { registerCardFrame, registerCardFrameSource, sendProjectionToCard, unregisterCardFrame } from "./projection.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import type { InspectorSession } from "../session/sessionFactory.ts";
import { disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { releaseDocumentProjection } from "../projection/structuralProjection.ts";
import { disposeRuntimeIdentityClaims } from "../runtime/runtimeIdentityClaims.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import { startClipboardHandoffController } from "../prompt/clipboardHandoff.ts";
import { SketchFrameOverlay } from "../sketch/SketchFrameOverlay.tsx";

interface PageCardProps {
  card: CanvasCard;
  documentOwner?: InspectorSession;
}

/** The page-surface Canvas card: the inspected page is the renderer. */
export function PageCard({ card, documentOwner }: PageCardProps): ReactElement {
  const cardRef = useRef(card);
  cardRef.current = card;
  const [ready, setReady] = useState(false);
  const frame = getPageFrame();

  useEffect(() => {
    registerCardFrameSource(card.id, frame);
    const session = documentOwner?.createDocumentSession(document);
    session?.registerCleanup(() => disposeBrowserCssInspection(document));
    session?.registerCleanup(() => releaseDocumentProjection(document));
    session?.registerCleanup(() => disposeRuntimeIdentityClaims(document));
    session?.registerCleanup(() => disposeInlineTextEdit("frame-disposed", document));
    session?.registerCleanup(startClipboardHandoffController(document));
    const announce = () => connectFrame(card.id, frame).post({ type: "parent-ready" });
    const unsubscribe = subscribeCanvasRendererMessages(({ frame: connection, message }) => {
      if (connection.cardId !== card.id) return;
      if (message.type === "renderer-hello") {
        announce();
        return;
      }
      if (message.type === "frame-ready") {
        registerCardFrame(card.id, frame);
        sendProjectionToCard(cardRef.current, frame);
        setReady(true);
      }
    });
    announce();
    return () => {
      unsubscribe();
      session?.dispose();
      unregisterCardFrame(card.id);
      setReady(false);
    };
  }, [card.id, documentOwner, frame]);

  return (
    <SketchFrameOverlay cardId={card.id} iframe={frame} cardUrl={contentSourceUrl(card.content)} ready={ready} />
  );
}
