type StyleRoot = Document | ShadowRoot;

/** Transient visual state projection, excluded from authored CSS inspection. */
export const STATE_PREVIEW_SHEET_ID = "nudge-ui-state-preview";
/** A value the user is considering in a field's list, excluded from authored CSS inspection. */
export const VALUE_PREVIEW_SHEET_ID = "nudge-ui-value-preview";

const styleElementSupport = new WeakMap<Document, boolean>();
const adoptedSheets = new WeakMap<StyleRoot, Map<string, CSSStyleSheet>>();
let adoptedOnly = false;

/** Skips the style-element probe because a blocked probe can log a violation to the site's CSP report endpoint. */
export function preferAdoptedStylesheets(): void {
  adoptedOnly = true;
}

/** A strict `style-src` blocks `<style>` elements but not constructable stylesheets; checked once per document. */
export function allowsStyleElements(doc: Document): boolean {
  if (adoptedOnly) return false;
  const known = styleElementSupport.get(doc);
  if (known !== undefined) return known;
  const probe = doc.createElement("style");
  probe.setAttribute("data-nudge-ui", "style-policy-probe");
  probe.textContent = ":root {}";
  (doc.head ?? doc.documentElement).appendChild(probe);
  const allowed = probe.sheet !== null;
  probe.remove();
  styleElementSupport.set(doc, allowed);
  return allowed;
}

function ownerDocumentOf(root: StyleRoot): Document {
  return root.nodeType === Node.DOCUMENT_NODE ? root as Document : (root as ShadowRoot).ownerDocument;
}

/** Creates or replaces the adopted sheet stored under `key`, after the root's own stylesheets. */
export function adoptStylesheet(root: StyleRoot, key: string, cssText: string): CSSStyleSheet | null {
  const view = ownerDocumentOf(root).defaultView;
  if (!view) return null;
  let sheets = adoptedSheets.get(root);
  if (!sheets) {
    sheets = new Map();
    adoptedSheets.set(root, sheets);
  }
  let sheet = sheets.get(key);
  if (!sheet) {
    sheet = new view.CSSStyleSheet();
    sheets.set(key, sheet);
  }
  sheet.replaceSync(cssText);
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return sheet;
}

/** The key a sheet was adopted under, or null for sheets the page adopted itself. */
export function adoptedStylesheetKey(root: StyleRoot, sheet: CSSStyleSheet): string | null {
  for (const [key, candidate] of adoptedSheets.get(root) ?? []) {
    if (candidate === sheet) return key;
  }
  return null;
}

export function getAdoptedStylesheet(root: StyleRoot, key: string): CSSStyleSheet | null {
  return adoptedSheets.get(root)?.get(key) ?? null;
}

export function releaseAdoptedStylesheet(root: StyleRoot, key: string): void {
  const sheet = adoptedSheets.get(root)?.get(key);
  if (!sheet) return;
  adoptedSheets.get(root)?.delete(key);
  root.adoptedStyleSheets = root.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
}
