/**
 * Token inventory contracts: artifact input, diagnostic, and immutable
 * inventory snapshot.
 *
 * This module is the Node/build-time seam of `@design-tool/css`. It is NOT
 * browser-safe (the import-graph test in `src/importGraph.test.ts` enforces
 * that `src/index.ts`, `src/model`, and `src/value-semantics` can never reach
 * it). Node consumers import `@design-tool/css/token-inventory`.
 */
import type {
  TokenCatalogDiagnosticCode,
  TokenDefinition,
  TokenEntry,
  TokenOrigin,
} from "../model/index.ts";

/**
 * Whether an artifact carries authored source or build-tool transformed
 * output. Repeated transforms replace the previous observation for the same
 * stable artifact identity.
 */
export type ArtifactStage = "authored" | "transformed";

/** Provenance of a stylesheet artifact (mirrors `TokenOrigin`). */
export type ArtifactProvenance = TokenOrigin;

/**
 * One stylesheet observation supplied to the token inventory. Immutable by
 * contract: build tools feed new observations, never mutate a stored artifact.
 *
 * `id` is the normalized source identity used by the build tool (the file id /
 * URL). `order` is the stylesheet/import order ONLY when the build tool can
 * prove it; an absent `order` receives deterministic discovery order keyed by
 * `id` and never claims browser cascade truth.
 *
 * A present `content` contributes rows; an absent `content` is a removal
 * marker that drops the artifact's rows from the inventory.
 */
export interface StylesheetArtifact {
  readonly buildTool: string;
  readonly id: string;
  readonly stage: ArtifactStage;
  readonly provenance: ArtifactProvenance;
  readonly order?: number;
  readonly content?: string;
}

/**
 * A structured inventory failure. `artifact` names the offending artifact id;
 * `code` reuses the shared `TokenCatalogDiagnosticCode` union so the Vite
 * transport can later serialize diagnostics without a second type system.
 */
export interface InventoryDiagnostic {
  readonly code: TokenCatalogDiagnosticCode;
  readonly message: string;
  readonly artifact: string;
}

/**
 * Immutable, deterministic projection of everything the inventory currently
 * knows. Two snapshots built from the same observable facts are identical,
 * including `generation`.
 *
 * - `definitions` are grouped `TokenDefinition`s (the exact shape
 *   `virtual:design-tokens` publishes) so a build-tool adapter can serialize
 *   them without rebuilding identities or order.
 * - `tokens` is the flat projection of `definitions` (name/cssName/value/
 *   source/provenance/editability), mirroring the existing virtual transport
 *   shape.
 * - `diagnostics` are ordered by artifact order.
 */
export interface InventorySnapshot {
  /** Stable fingerprint over the observable facts; changes only when they do. */
  readonly generation: string;
  readonly definitions: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly diagnostics: readonly InventoryDiagnostic[];
}
