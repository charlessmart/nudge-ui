/**
 * The document body as a styling-only target for page-wide styles such as the base font.
 * It never carries instrumentation identity, so pointer picking cannot reach it; only the
 * DOM navigator selects it, and structural edits never apply to it.
 */
export const PAGE_TARGET_CID = "nudge-ui:page";
export const PAGE_TARGET_SELECTOR = "body";

export function isPageTarget(element: Element): boolean {
  return element === element.ownerDocument.body;
}

export function isPageTargetCid(cid: string | null | undefined): boolean {
  return cid === PAGE_TARGET_CID;
}
