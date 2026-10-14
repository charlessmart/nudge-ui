import type { TokenDefinition } from "../../css/model/index.ts";
import {
  createBrowserCssInspection,
  type BrowserCssInspection,
  type BrowserTokenKnowledge,
} from "./browserCssInspection.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

interface DocumentSession {
  session: BrowserCssInspection;
  generation: string | number;
}

const sessions = new WeakMap<Document, DocumentSession>();
let catalogReference: readonly TokenDefinition[] | null = null;
let catalogSignature = "";
let catalogRevision = 0;

function currentTokenKnowledge(): BrowserTokenKnowledge {
  const { tokenCatalog, tokenGeneration } = getNudgeUiRuntimeConfig();
  // The inventory generation recreates document sessions with new definitions; the catalog signature supplements it for post-snapshot enrichment.
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

export function getBrowserCssInspection(doc: Document = document): BrowserCssInspection {
  return bindBrowserCssInspection(doc, currentTokenKnowledge());
}

export function notifyBrowserStylesheetChange(doc: Document = document): void {
  getBrowserCssInspection(doc).notifyStylesheetChange();
}

export function disposeBrowserCssInspection(doc: Document): void {
  const entry = sessions.get(doc);
  if (!entry) return;
  entry.session.dispose();
  sessions.delete(doc);
}
