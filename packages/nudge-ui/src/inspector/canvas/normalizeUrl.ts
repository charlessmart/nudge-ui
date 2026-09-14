export interface NormalizedUrl {
  origin: string;
  pathname: string;
  search: string;
}

export function normalizeUrl(url: string): NormalizedUrl | null {
  try {
    const parsed = new URL(url);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
    };
  } catch {
    return null;
  }
}

export function normalizedUrlKey(normalized: NormalizedUrl): string {
  return `${normalized.origin}${canonicalRoutePath(normalized.pathname)}${normalized.search}`;
}

/**
 * Directory-index pages resolve to the directory URL: `/` and `/index.html`
 * are one route served from one file on every supported dev server, so card
 * deduplication must treat them as the same key or link discovery spawns a
 * duplicate card for the page already on the board.
 */
function canonicalRoutePath(pathname: string): string {
  // "/docs/index.html" becomes the directory form "/docs/"; a bare
  // "/index.html" becomes "/".
  return pathname.replace(/\/index\.html?$/i, "/");
}
