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
