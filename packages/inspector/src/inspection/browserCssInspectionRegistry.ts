import { tokenCatalog } from "virtual:design-tokens";
import {
  createBrowserCssInspection,
  type BrowserCssInspection,
  type BrowserTokenKnowledge,
} from "./browserCssInspection.ts";

interface DocumentSession {
  session: BrowserCssInspection;
  generation: string | number;
}

const sessions = new WeakMap<Document, DocumentSession>();
let catalogReference = tokenCatalog;
let catalogGeneration = 0;

function currentTokenKnowledge(): BrowserTokenKnowledge {
  // Vite replaces the virtual export when token inventory changes. The
  // generation makes that replacement visible so document sessions recreate
  // with the new definitions instead of freezing the first catalog snapshot.
  if (catalogReference !== tokenCatalog) {
    catalogReference = tokenCatalog;
    catalogGeneration++;
  }
  return { definitions: tokenCatalog, generation: catalogGeneration };
}

/**
 * Binds a document to token knowledge. When generation changes, the previous
 * session is disposed and replaced so callers never keep a stale catalog.
 */
export function bindBrowserCssInspection(
  doc: Document,
  knowledge: BrowserTokenKnowledge,
): BrowserCssInspection {
  const existing = sessions.get(doc);
  if (existing && existing.generation === knowledge.generation) {
    return existing.session;
  }
  if (existing) {
    existing.session.dispose();
    sessions.delete(doc);
  }
  const session = createBrowserCssInspection({
    document: doc,
    tokenKnowledge: knowledge,
  });
  sessions.set(doc, { session, generation: knowledge.generation });
  return session;
}

/** Returns the one browser inspection session owned by a document. */
export function getBrowserCssInspection(doc: Document = document): BrowserCssInspection {
  return bindBrowserCssInspection(doc, currentTokenKnowledge());
}

/** Invalidates every browser-inspection snapshot affected by a CSSOM write. */
export function notifyBrowserStylesheetChange(doc: Document = document): void {
  getBrowserCssInspection(doc).notifyStylesheetChange();
}

/** Releases a document session when its inspector/Canvas lifecycle ends. */
export function disposeBrowserCssInspection(doc: Document): void {
  const entry = sessions.get(doc);
  if (!entry) return;
  entry.session.dispose();
  sessions.delete(doc);
}
