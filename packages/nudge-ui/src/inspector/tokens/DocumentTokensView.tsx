import type { ReactElement } from "react";
import { useBrowserCssInspection } from "../inspection/useBrowserCssInspection.ts";
import { getBrowserCssInspection } from "../inspection/browserCssInspectionRegistry.ts";
import { useSelectedElement } from "../selection/selectionStore.ts";
import { useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { TokensPanel } from "./TokensPanel.tsx";

/**
 * The design tokens of the document being inspected: the selected element's, else the selected or focused card's,
 * else this page's. Mounted only while the panel shows tokens, so the document is only read for them then.
 */
export function DocumentTokensView(): ReactElement {
  const selectedElement = useSelectedElement();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const activeFrame = getRegisteredFrames().get(selectedCardId ?? focusedCardId ?? "");
  const activeDocument = selectedElement?.domElement.ownerDocument ?? activeFrame?.contentDocument ?? document;
  const tokenInspection = useBrowserCssInspection(null, "base", {
    includeDocumentTokens: true,
    session: getBrowserCssInspection(activeDocument),
  });
  return (
    <section className="document-tokens" data-test="document-tokens">
      <TokensPanel rows={tokenInspection.documentTokens?.tokens ?? []} />
    </section>
  );
}
