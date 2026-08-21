import type { TokenDefinition } from "@design-tool/css/model";
import {
  createBrowserCssInspection,
  type BrowserCssInspection,
  type BrowserTokenKnowledge,
} from "./browserCssInspection.ts";
import { getDesignToolRuntimeConfig } from "../runtimeConfig.ts";

interface DocumentSession {
  session: BrowserCssInspection;
  generation: string | number;
}

const sessions = new WeakMap<Document, DocumentSession>();
let catalogReference: readonly TokenDefinition[] | null = null;
let catalogSignature = "";
let catalogRevision = 0;

function currentTokenKnowledge(): BrowserTokenKnowledge {
  const { tokenCatalog, tokenGeneration } = getDesignToolRuntimeConfig();
  // The inventory snapshot generation is the authoritative fingerprint: when
  // observable inventory facts change, the virtual module re-evaluates and
  // `tokenGeneration` carries a new value, so document sessions recreate with
  // the new definitions instead of freezing the first catalog snapshot.
  //
  // A catalog signature supplements the inventory generation because S2-B
  // still has temporary post-snapshot Tailwind/vanilla-extract enrichment.
  // It advances only when those observable transport definitions change, not
  // for a no-op virtual-module replacement.
  if (catalogReference !== tokenCatalog) {
    catalogReference = tokenCatalog;
    const nextSignature = JSON.stringify(tokenCatalog);
    if (nextSignature !== catalogSignature) {
      catalogSignature = nextSignature;
      catalogRevision++;
    }
  }
  const generation = tokenGeneration === ""
    ? catalogRevision
    : catalogRevision === 0 ? tokenGeneration : `${tokenGeneration}:${catalogRevision}`;
  return { definitions: tokenCatalog, generation };
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
