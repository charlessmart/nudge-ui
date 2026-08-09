import { escapeAttrValue } from "./cssEscapes.ts";

/** Stable JSX instrumentation selector, shared by source and instance edits. */
export function sourceSiteSelector(cid: string, src: string): string | null {
  if (!cid) return null;
  if (!src) return `[data-cid="${escapeAttrValue(cid)}"]`;
  // A source site is the complete file:line:column identity injected by the
  // Vite transform. Keeping only file:line makes separate JSX elements on a
  // single formatted line share a managed rule.
  return `[data-cid="${escapeAttrValue(cid)}"][data-src="${escapeAttrValue(src)}"]`;
}
