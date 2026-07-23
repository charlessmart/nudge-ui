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
  return `${normalized.origin}${normalized.pathname}${normalized.search}`;
}
