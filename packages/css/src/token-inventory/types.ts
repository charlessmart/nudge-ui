/**
 * Token inventory contracts: artifact input, normalized styling contributions,
 * diagnostics, and immutable snapshots.
 *
 * This Node/build-time seam is intentionally absent from the browser-safe
 * `@design-tool/css` export graph.
 */
import type {
  TokenCatalogDiagnosticCode,
  TokenDefinition,
  TokenDeclaration,
  TokenEntry,
  TokenOrigin,
} from "../model/index.ts";

export type ArtifactStage = "authored" | "transformed";
export type ArtifactProvenance = TokenOrigin;

/** One authored or transformed observation supplied by a build-tool Adapter. */
export interface StylesheetArtifact {
  readonly buildTool: string;
  readonly id: string;
  readonly stage: ArtifactStage;
  readonly provenance: ArtifactProvenance;
  /** Authoritative stylesheet/import order, only when the Adapter can prove it. */
  readonly order?: number;
  /** Deterministic scan rank when browser/cascade order is not known. */
  readonly discoveryOrder?: number;
  readonly content?: string;
  /** Generic styling-system label propagated onto reconciled non-package rows. */
  readonly adapter?: string;
  /** A recoverable transformed-observation failure; authored facts are retained. */
  readonly failed?: boolean;
  /** Adapter failures associated with this observation. */
  readonly diagnostics?: readonly ArtifactDiagnosticInput[];
}

export interface ArtifactDiagnosticInput {
  readonly code: TokenCatalogDiagnosticCode;
  readonly message: string;
  readonly module?: string;
  readonly exportName?: string;
}

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

export interface InventoryTokenDeclaration extends Omit<TokenDeclaration, "order"> {
  readonly order: number;
  readonly contribution: InventoryContribution;
}

export interface InventoryTokenDefinition extends Omit<TokenDefinition, "declarations"> {
  readonly declarations: readonly InventoryTokenDeclaration[];
}

/** Declarative metadata rewrite for matching aggregated definitions. */
export interface TokenDefinitionRelabelling {
  readonly adapter: string;
  readonly fromOrigin: TokenOrigin;
  readonly origin?: TokenOrigin;
  readonly editable?: boolean;
}

/**
 * A normalized styling contribution. Re-applying the same `id` replaces its
 * prior facts; contribution order is explicit or deterministically id-based.
 */
export interface TokenContribution {
  readonly id: string;
  readonly tokens?: readonly TokenEntry[];
  /** Metadata/declaration enrichment for active definitions with matching cssName. */
  readonly definitions?: readonly TokenDefinition[];
  /** Deterministic metadata rewrites, matched by adapter and current origin. */
  readonly relabellings?: readonly TokenDefinitionRelabelling[];
  readonly diagnostics?: readonly InventoryDiagnostic[];
  readonly order?: number;
}

export interface InventorySnapshot {
  readonly generation: string;
  readonly definitions: readonly InventoryTokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly diagnostics: readonly InventoryDiagnostic[];
}
