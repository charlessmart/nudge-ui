/**
 * Cross-origin stylesheets hide their rules from page scripts unless the `<link>` opts into CORS, which CDN-hosted CSS
 * rarely does. The inspector runs as a page script (the Chrome extension injects it into the page's main world), so it
 * fetches those sheets itself and parses a constructed copy whose rules stand in for the hidden ones.
 */

export type StylesheetText = { readonly text: string } | { readonly error: string };

interface FetchedStylesheet {
  readonly text: Promise<StylesheetText>;
  /** The parsed copy, once the fetch succeeds; it is never adopted, so it cannot style the page. */
  copy: CSSStyleSheet | null;
}

const fetchedSheets = new WeakMap<CSSStyleSheet, FetchedStylesheet>();
const copyListeners = new WeakMap<Document, Set<() => void>>();

function hidesRules(sheet: CSSStyleSheet): boolean {
  try {
    void sheet.cssRules;
    return false;
  } catch {
    return true;
  }
}

async function fetchText(view: Window, href: string): Promise<StylesheetText> {
  try {
    const response = await view.fetch(href, { mode: "cors", credentials: "omit" });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { text: await response.text() };
  } catch {
    return { error: "cross-origin stylesheet without CORS access" };
  }
}

/** Parses `text` into a constructed sheet that is never adopted, based on `href` so relative `url()`s still resolve against it. */
function parseCopy(view: Window & typeof globalThis, href: string, text: string): CSSStyleSheet | null {
  try {
    const copy = new view.CSSStyleSheet({ baseURL: href });
    // Constructed sheets skip `@import`; an imported cross-origin sheet stays hidden, as it would without the copy.
    copy.replaceSync(text);
    return copy;
  } catch {
    return null;
  }
}

function fetchSheet(sheet: CSSStyleSheet, doc: Document): FetchedStylesheet | null {
  const existing = fetchedSheets.get(sheet);
  if (existing) return existing;
  const view = doc.defaultView;
  const href = sheet.href;
  if (!view || !href) return null;
  const entry: FetchedStylesheet = { text: fetchText(view, href), copy: null };
  fetchedSheets.set(sheet, entry);
  void entry.text.then((result) => {
    if (!("text" in result)) return;
    entry.copy = parseCopy(view, href, result.text);
    if (entry.copy) copyListeners.get(doc)?.forEach((listener) => listener());
  });
  return entry;
}

/**
 * The sheet whose rules describe `sheet`: itself when readable, otherwise its fetched copy. Returns null while the copy
 * is loading or when the server refuses CORS; a finished copy notifies `subscribeStylesheetCopies` listeners.
 */
export function readableStylesheet(sheet: CSSStyleSheet, doc: Document): CSSStyleSheet | null {
  if (!hidesRules(sheet)) return sheet;
  return fetchSheet(sheet, doc)?.copy ?? null;
}

/** The sheet's source text, sharing the fetch `readableStylesheet` makes for the same sheet. */
export function stylesheetText(sheet: CSSStyleSheet, doc: Document): Promise<StylesheetText> {
  return fetchSheet(sheet, doc)?.text ?? Promise.resolve({ error: "stylesheet rules are not readable" });
}

/** Calls `listener` each time a cross-origin sheet's copy becomes readable. */
export function subscribeStylesheetCopies(doc: Document, listener: () => void): () => void {
  let listeners = copyListeners.get(doc);
  if (!listeners) {
    listeners = new Set();
    copyListeners.set(doc, listeners);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hosts whose stylesheets stay unreadable: hidden from page scripts, and refused to the fallback fetch too. */
export async function unreadableStylesheetHosts(doc: Document): Promise<string[]> {
  const hidden = Array.from(doc.styleSheets).filter(hidesRules);
  const results = await Promise.all(hidden.map(async (sheet) => ({ href: sheet.href, result: await stylesheetText(sheet, doc) })));
  const hosts = new Set<string>();
  for (const { href, result } of results) {
    if (href && "error" in result) hosts.add(new URL(href, doc.baseURI).host);
  }
  return [...hosts];
}
