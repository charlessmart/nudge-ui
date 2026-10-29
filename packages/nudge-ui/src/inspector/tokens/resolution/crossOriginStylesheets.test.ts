// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { collectRules, documentRevisions, invalidateStyleResolutionCache } from "./cssomCollector.ts";
import { readableStylesheet, stylesheetText, subscribeStylesheetCopies } from "./crossOriginStylesheets.ts";

const CDN_CSS = ".cta { transition: color 200ms; } .cta:hover { color: red; } .logo { background: url(logo.svg); }";

/** A `<link>` sheet from another origin, whose rules the browser hides from page scripts. */
function hiddenSheet(href = "https://cdn.example/site.css"): CSSStyleSheet {
  const sheet: CSSStyleSheet = Object.create(CSSStyleSheet.prototype);
  return Object.defineProperties(sheet, {
    href: { value: href },
    ownerNode: { value: null },
    cssRules: {
      get(): never {
        throw new DOMException("Cannot access rules", "SecurityError");
      },
    },
  });
}

/** The document's stylesheet list, holding only `sheets`. */
function styleSheetList(...sheets: CSSStyleSheet[]): StyleSheetList {
  const list: StyleSheetList = Object.create(StyleSheetList.prototype);
  return Object.defineProperties(list, {
    ...Object.fromEntries(sheets.map((sheet, index) => [index, { value: sheet }])),
    length: { value: sheets.length },
    [Symbol.iterator]: { value: () => sheets[Symbol.iterator]() },
  });
}

function respondWith(body: string, status = 200) {
  return vi.spyOn(window, "fetch").mockResolvedValue(new Response(body, { status }));
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** jsdom constructs stylesheets but cannot replace their text; parse through a transient `<style>` instead. */
function installReplaceSync(): void {
  if (typeof CSSStyleSheet.prototype.replaceSync === "function") return;
  CSSStyleSheet.prototype.replaceSync = function replaceSync(this: CSSStyleSheet, text: string): void {
    const style = document.createElement("style");
    style.textContent = text;
    document.head.append(style);
    const rules = Array.from(style.sheet!.cssRules, (rule) => rule.cssText);
    style.remove();
    rules.forEach((rule, index) => this.insertRule(rule, index));
  };
}

describe("cross-origin stylesheets", () => {
  beforeAll(installReplaceSync);

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  it("returns a readable sheet as is, without fetching it", () => {
    const fetch = respondWith(CDN_CSS);
    const style = document.createElement("style");
    style.textContent = ".local { color: blue; }";
    document.head.append(style);

    expect(readableStylesheet(style.sheet!, document)).toBe(style.sheet);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches a hidden sheet once and stands in a parsed copy for it", async () => {
    const fetch = respondWith(CDN_CSS);
    const sheet = hiddenSheet();
    const listener = vi.fn();
    const stop = subscribeStylesheetCopies(document, listener);

    expect(readableStylesheet(sheet, document)).toBeNull();
    expect(readableStylesheet(sheet, document)).toBeNull();
    await flush();
    const copy = readableStylesheet(sheet, document);
    stop();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://cdn.example/site.css", { mode: "cors", credentials: "omit" });
    expect(listener).toHaveBeenCalledOnce();
    expect(Array.from(copy!.cssRules, (rule) => (rule as CSSStyleRule).selectorText)).toEqual([".cta", ".cta:hover", ".logo"]);
    // The copy is never adopted, so the page's own stylesheet list is untouched.
    expect(document.styleSheets).toHaveLength(0);
  });

  it("shares one fetch between the rule copy and the sheet's source text", async () => {
    const fetch = respondWith(CDN_CSS);
    const sheet = hiddenSheet();

    readableStylesheet(sheet, document);

    await expect(stylesheetText(sheet, document)).resolves.toEqual({ text: CDN_CSS });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("leaves a sheet hidden when the server refuses it", async () => {
    respondWith("", 403);
    const sheet = hiddenSheet();

    readableStylesheet(sheet, document);
    await flush();

    expect(readableStylesheet(sheet, document)).toBeNull();
    await expect(stylesheetText(sheet, document)).resolves.toEqual({ error: "HTTP 403" });
  });

  it("adds a fetched sheet's rules to the cascade and invalidates the cached collection", async () => {
    respondWith(CDN_CSS);
    const sheet = hiddenSheet();
    vi.spyOn(document, "styleSheets", "get").mockReturnValue(styleSheetList(sheet));

    const before = collectRules(document);
    const revision = documentRevisions(document).stylesheet;
    await flush();
    const after = collectRules(document);

    expect(before).toMatchObject({ rules: [], inaccessible: true });
    expect(documentRevisions(document).stylesheet).toBeGreaterThan(revision);
    expect(after.inaccessible).toBe(false);
    expect(after.rules.map((rule) => [rule.selectorText, rule.source])).toEqual([
      [".cta", "https://cdn.example/site.css"],
      [".cta:hover", "https://cdn.example/site.css"],
      [".logo", "https://cdn.example/site.css"],
    ]);
  });
});
