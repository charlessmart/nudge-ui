import { escapeAttrValue } from "./managedStylesheet.ts";

export type EditScope = "source-site" | "instance-preview";

export interface InstanceEvidence {
  renderedIndex: number;
  props: string | null;
  text: string | null;
}

const INSTANCE_ATTR = "data-dt-instance";
let nextInstanceId = 1;

export function sourceSiteSelector(cid: string, src: string): string | null {
  if (!cid) return null;
  if (!src) return `[data-cid="${escapeAttrValue(cid)}"]`;
  const match = /^(.*):(\d+):(\d+)$/.exec(src);
  const source = match ? `${match[1]}:${match[2]}` : src;
  return `[data-cid="${escapeAttrValue(cid)}"][data-src*="${escapeAttrValue(source)}"]`;
}

export function countSourceSiteMatches(el: HTMLElement): number {
  const selector = sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
  if (!selector) return 0;
  try { return el.ownerDocument.querySelectorAll(selector).length; } catch { return 0; }
}

export function unlinkElement(el: HTMLElement): string {
  const existing = el.getAttribute(INSTANCE_ATTR);
  if (existing) return existing;
  const id = `i${nextInstanceId++}`;
  el.setAttribute(INSTANCE_ATTR, id);
  return id;
}

export function relinkElement(el: HTMLElement): void {
  el.removeAttribute(INSTANCE_ATTR);
}

export function getEditScope(el: HTMLElement): EditScope {
  return el.hasAttribute(INSTANCE_ATTR) ? "instance-preview" : "source-site";
}

export function selectorForElement(el: HTMLElement): string | null {
  const instance = el.getAttribute(INSTANCE_ATTR);
  if (instance) {
    const sourceSelector = sourceSiteSelector(
      el.getAttribute("data-cid") ?? "",
      el.getAttribute("data-src") ?? "",
    );
    const instanceSelector = `[${INSTANCE_ATTR}="${escapeAttrValue(instance)}"]`;
    return sourceSelector ? `${sourceSelector}${instanceSelector}` : instanceSelector;
  }
  return sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
}

export function getInstanceEvidence(el: HTMLElement): InstanceEvidence {
  const selector = sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
  const matches = selector ? Array.from(el.ownerDocument.querySelectorAll(selector)) : [];
  const renderedIndex = Math.max(0, matches.indexOf(el));
  const text = el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  return { renderedIndex, props: el.getAttribute("data-cprops"), text };
}
