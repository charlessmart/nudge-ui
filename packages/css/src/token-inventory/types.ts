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
  TokenDeclaration,
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
 * `buildTool` + `id` + `stage` form the stable observation identity. `order`
 * is the stylesheet/import order ONLY when the build tool can prove it;
 * otherwise `discoveryOrder` carries source-scan evidence. If neither is
 * supplied, the inventory derives a deterministic lexical discovery rank that
 * never claims browser cascade truth.
 *
 * A present `content` contributes rows; an absent `content` is a removal
 * marker that drops the artifact's rows from the inventory.
 */
export interface StylesheetArtifact {
  readonly buildTool: string;
  readonly id: string;
  readonly stage: ArtifactStage;
  readonly provenance: ArtifactProvenance;
  /** Authoritative stylesheet/import order, only when the Adapter can prove it. */
  readonly order?: number;
  /** Deterministic source-scan rank when browser/cascade order is not known. */
  readonly discoveryOrder?: number;
  readonly content?: string;
  /** Adapter failures associated with this observation when content is unavailable or partial. */
  readonly diagnostics?: readonly ArtifactDiagnosticInput[];
}

export interface ArtifactDiagnosticInput {
  readonly code: TokenCatalogDiagnosticCode;
  readonly message: string;
  readonly module?: string;
  readonly exportName?: string;
}

/**
 * A structured inventory failure. Stylesheet failures name their `artifact`;
 * styling-Adapter failures may instead name a module/export. `code` reuses the
 * shared diagnostic union so Vite can later serialize failures without a
 * second type system.
 */
export interface InventoryDiagnostic {
  readonly code: TokenCatalogDiagnosticCode;
  readonly message: string;
  readonly artifact?: string;
  readonly module?: string;
  readonly exportName?: string;
}

export type InventoryOrderEvidence =
  | { readonly kind: "stylesheet"; readonly index: number }
  | { readonly kind: "discovery"; readonly index: number };

export type InventoryContribution =
  | {
    readonly kind: "stylesheet";
    readonly buildTool: string;
    readonly id: string;
    readonly stage: ArtifactStage;
    readonly provenance: ArtifactProvenance;
    readonly editable: boolean;
    readonly orderEvidence: InventoryOrderEvidence;
  }
  | {
    readonly kind: "adapter";
    readonly id: string;
    readonly provenance?: TokenOrigin;
    readonly editable?: boolean;
    readonly order: number;
  };

/** Authored declaration plus the inventory evidence that produced it. */
export interface InventoryTokenDeclaration extends Omit<TokenDeclaration, "order"> {
  readonly order: number;
  readonly contribution: InventoryContribution;
}

/** Grouped token definition retaining evidence for every authored declaration. */
export interface InventoryTokenDefinition extends Omit<TokenDefinition, "declarations"> {
  readonly declarations: readonly InventoryTokenDeclaration[];
}

export interface AdapterContributions {
  readonly tokens: readonly TokenEntry[];
  readonly diagnostics?: readonly InventoryDiagnostic[];
}

/**
 * Immutable, deterministic projection of everything the inventory currently
 * knows. Two snapshots built from the same observable facts are identical,
 * including `generation`.
 *
 * - `definitions` are grouped token definitions enriched with per-declaration
 *   provenance and order evidence. They retain the virtual transport fields,
 *   so an Adapter can serialize them without rebuilding identities or order.
 * - `tokens` is the flat projection of `definitions` (name/cssName/value/
 *   source/provenance/editability), mirroring the existing virtual transport
 *   shape.
 * - `diagnostics` are ordered by artifact order.
 */
export interface InventorySnapshot {
  /** Stable fingerprint over the observable facts; changes only when they do. */
  readonly generation: string;
  readonly definitions: readonly InventoryTokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly diagnostics: readonly InventoryDiagnostic[];
}
