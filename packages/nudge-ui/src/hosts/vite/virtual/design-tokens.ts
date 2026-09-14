import type {
  TokenCatalogDiagnostic,
  TokenDefinition,
  TokenEntry,
} from "../../../css/model/index.ts";

export type {
  TokenCatalogDiagnostic,
  TokenContext,
  TokenContextWrapper,
  TokenContextWrapperKind,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "../../../css/model/index.ts";

export const tokenTable: Record<string, TokenEntry> = {};

/** Authoritative contextual inventory. Runtime values still come from CSS. */
export const tokenCatalog: TokenDefinition[] = [];
export const tokenDiagnostics: TokenCatalogDiagnostic[] = [];

/** Inventory snapshot fingerprint; browser inspection refreshes on change. */
export const tokenGeneration: string = "";

export default tokenTable;
