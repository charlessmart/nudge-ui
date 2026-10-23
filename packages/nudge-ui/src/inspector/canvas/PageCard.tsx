import { useEffect, useRef } from "react";
import type { CanvasCard } from "./canvasStore.ts";
import { connectFrame } from "./frameConnection.ts";
import { getPageFrame } from "./pageSurface.ts";
import { registerCardFrame, registerCardFrameSource, sendProjectionToCard, unregisterCardFrame } from "./projection.ts";
import { subscribeCanvasRendererMessages } from "./rendererMessageRouter.ts";
import type { InspectorSession } from "../session/sessionFactory.ts";
import { disposeBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { releaseDocumentProjection } from "../projection/structuralProjection.ts";
import { disposeRuntimeIdentityClaims } from "../runtime/runtimeIdentityClaims.ts";
import { disposeInlineTextEdit } from "../inline-text/inlineTextEditor.ts";
import { startClipboardHandoffController } from "../prompt/clipboardHandoff.ts";

interface PageCardProps {
  card: CanvasCard;
  documentOwner?: InspectorSession;
}

/** Connects the live page to the canvas as a card; it renders nothing of its own. */
export function PageCard({ card, documentOwner }: PageCardProps): null {
  const cardRef = useRef(card);
  cardRef.current = card;
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
      }
    });
    announce();
    return () => {
      unsubscribe();
      session?.dispose();
      unregisterCardFrame(card.id);
    };
  }, [card.id, documentOwner, frame]);

  return null;
}
