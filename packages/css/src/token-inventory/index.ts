/**
 * `@design-tool/css/token-inventory` — Node/build-time stylesheet parsing and
 * aggregation.
 *
 * This subpath is intentionally NOT browser-safe (see the import-graph test):
 * importing it pulls PostCSS into the consumer. Node consumers use it directly
 * through `@design-tool/css/token-inventory`; the root `@design-tool/css`
 * entry stays browser-safe and never re-exports this module.
 *
 * The deep Interface is `createTokenInventory()` — feed ordered stylesheet
 * artifacts and Adapter literal tokens, read immutable deterministic snapshots.
 * `parseStylesheetArtifact` is an internal seam used by the engine and tests.
 *
 * ## Deletion test
 *
 * This Module earns its seam: deleting it would force the Vite Adapter to
 * re-own PostCSS parsing, authored/transformed reconciliation, declaration
 * identity and ordering, project/package/generated provenance, contribution
 * merging, structured diagnostics, and the generation fingerprint that
 * `BrowserTokenKnowledge` uses to refresh inspection sessions. The Adapter
 * would also have to re-solve the determinism/no-op guarantees that keep
 * equivalent HMR event batches from churning the snapshot.
 */
export { createTokenInventory } from "./inventory.ts";
export type { TokenInventory } from "./inventory.ts";

export type {
  ArtifactProvenance,
  ArtifactStage,
  TokenDefinitionRelabelling,
  ArtifactDiagnosticInput,
  InventoryContribution,
  InventoryDiagnostic,
  InventoryOrderEvidence,
  InventorySnapshot,
  InventoryTokenDeclaration,
  InventoryTokenDefinition,
  StylesheetArtifact,
  TokenContribution,
} from "./types.ts";

export { parseStylesheetArtifact } from "./parseStylesheet.ts";
export type { ParsedContribution } from "./parseStylesheet.ts";

export {
  GLOBAL_TOKEN_AT_RULES,
  MIN_THEME_TABLE_DECLARATIONS,
  SCOPED_THEME_TABLE_POLICY,
} from "./policy.ts";
export type { ScopedThemeTablePolicy } from "./policy.ts";
