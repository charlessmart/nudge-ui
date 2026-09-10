import {
  collectDocumentStylesheetOrder,
  reconcileDocumentTokenCatalog,
  reconcileRuntimeWithDocumentStylesheets,
  type DocumentStylesheetOrderEvidence,
  type DocumentTokenCatalogReconciliation,
} from "@nudge-ui/inspector/document-runtime";
import type { TokenDefinition } from "@nudge-ui/css/model";
import type { NudgeUiRuntimeConfig } from "@nudge-ui/inspector";

/** @deprecated Use the host-neutral document runtime type. */
export type StandaloneStylesheetOrderEvidence = DocumentStylesheetOrderEvidence;
/** @deprecated Use the host-neutral document runtime type. */
export type StandaloneTokenCatalogReconciliation = DocumentTokenCatalogReconciliation;

/** Compatibility name for the shared document stylesheet-order collector. */
export function collectStandaloneStylesheetOrder(
  document: Document,
): StandaloneStylesheetOrderEvidence {
  return collectDocumentStylesheetOrder(document);
}

/** Compatibility name for the shared document token reconciliation. */
export function reconcileStandaloneTokenCatalog(
  catalog: readonly TokenDefinition[],
  evidence: StandaloneStylesheetOrderEvidence,
): StandaloneTokenCatalogReconciliation {
  return reconcileDocumentTokenCatalog(catalog, evidence);
}

/** Compatibility name for the shared document runtime reconciliation. */
export function reconcileStandaloneRuntime(
  runtime: NudgeUiRuntimeConfig,
  document: Document,
): NudgeUiRuntimeConfig {
  return reconcileRuntimeWithDocumentStylesheets(runtime, document);
}
