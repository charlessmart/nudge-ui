import { escapeAttrValue } from "../projection/cssEscapes.ts";

const SOURCE_POSITION = /^(.+):\d+:\d+$/;

/** Stable JSX instrumentation selector, shared by source and instance edits. */
export function sourceSiteSelector(cid: string, src: string): string | null {
  if (!cid) return null;
  if (!src) return `[data-cid="${escapeAttrValue(cid)}"]`;
  // File:line alone would merge separate JSX elements on one formatted line into a single managed rule.
  return `[data-cid="${escapeAttrValue(cid)}"][data-src="${escapeAttrValue(src)}"]`;
}

/** Returns a moved position only when the original renders nothing and exactly one other position in the file matches. */
export function relocateSourceSite(
  doc: Document,
  site: { readonly cid: string; readonly src: string },
  matches: (element: HTMLElement) => boolean,
): { cid: string; src: string } | null {
  const file = SOURCE_POSITION.exec(site.src)?.[1];
  const exact = sourceSiteSelector(site.cid, site.src);
  if (!file || !exact) return null;
  try {
    if (doc.querySelector(exact)) return null;
    const sites = new Set<string>();
    const sameFile = `[data-cid="${escapeAttrValue(site.cid)}"][data-src^="${escapeAttrValue(`${file}:`)}"]`;
    for (const element of doc.querySelectorAll<HTMLElement>(sameFile)) {
      const src = element.getAttribute("data-src") ?? "";
      if (SOURCE_POSITION.exec(src)?.[1] === file && matches(element)) sites.add(src);
    }
    const [src] = sites;
    return sites.size === 1 && src ? { cid: site.cid, src } : null;
  } catch {
    return null;
  }
}
