import type {
  TokenCatalogDiagnostic,
  TokenContext,
  TokenContextWrapper,
  TokenContextWrapperKind,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "@design-tool/css/model";

export type {
  TokenCatalogDiagnostic,
  TokenContext,
  TokenContextWrapper,
  TokenContextWrapperKind,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "@design-tool/css/model";

export const tokens: TokenEntry[] = [];
export let tokenCatalog: TokenDefinition[] = [];
export const tokenDiagnostics: TokenCatalogDiagnostic[] = [];
export let tokenGeneration = "";
export const designToolProjectId = "/stub/project";

/** Test-only live-binding update that mirrors Vite replacing the virtual module. */
export function setDesignTokensStub(
  catalog: TokenDefinition[],
  generation: string,
): void {
  tokenCatalog = catalog;
  tokenGeneration = generation;
}

export default tokens;
