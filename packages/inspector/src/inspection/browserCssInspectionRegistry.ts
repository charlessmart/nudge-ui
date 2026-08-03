import { tokenCatalog } from "virtual:design-tokens";
import {
  createBrowserCssInspection,
  type BrowserCssInspection,
} from "./browserCssInspection.ts";

const sessions = new WeakMap<Document, BrowserCssInspection>();
let catalogReference = tokenCatalog;
let catalogGeneration = 0;

function currentTokenKnowledge(): { definitions: typeof tokenCatalog; generation: number } {
  // Vite replaces the virtual export when token inventory changes. The
  // generation makes that replacement visible to snapshots without exposing
  // the build tool's module identity to browser callers.
  if (catalogReference !== tokenCatalog) {
    catalogReference = tokenCatalog;
    catalogGeneration++;
  }
  return { definitions: tokenCatalog, generation: catalogGeneration };
}

/** Returns the one browser inspection session owned by a document. */
export function getBrowserCssInspection(doc: Document = document): BrowserCssInspection {
  const existing = sessions.get(doc);
  if (existing) return existing;
  const session = createBrowserCssInspection({
    document: doc,
    tokenKnowledge: currentTokenKnowledge(),
  });
  sessions.set(doc, session);
  return session;
}

/** Releases a document session when its inspector/Canvas lifecycle ends. */
export function disposeBrowserCssInspection(doc: Document): void {
  const session = sessions.get(doc);
  if (!session) return;
  session.dispose();
  sessions.delete(doc);
}
