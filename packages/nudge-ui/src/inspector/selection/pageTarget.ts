/** Body as a styling-only target: no instrumentation identity, never picked, never structurally edited. */
export const PAGE_TARGET_CID = "nudge-ui:page";
export const PAGE_TARGET_SELECTOR = "body";

export function isPageTarget(element: Element): boolean {
  return element === element.ownerDocument.body;
}

export function isPageTargetCid(cid: string | null | undefined): boolean {
  return cid === PAGE_TARGET_CID;
}
