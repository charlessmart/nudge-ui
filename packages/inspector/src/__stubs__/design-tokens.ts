import type {
  TokenCatalogDiagnostic,
  TokenContext,
  TokenContextWrapper,
  TokenContextWrapperKind,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "@nudge-ui/css/model";
import {
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
} from "../runtime/runtimeConfig.ts";

export type {
  TokenCatalogDiagnostic,
  TokenContext,
  TokenContextWrapper,
  TokenContextWrapperKind,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "@nudge-ui/css/model";

export const tokens: TokenEntry[] = [];
export let tokenCatalog: TokenDefinition[] = [];
export const tokenDiagnostics: TokenCatalogDiagnostic[] = [];
export let tokenGeneration = "";
export const nudgeUiProjectId = getNudgeUiRuntimeConfig().projectId;

/** Test-only live-binding update that mirrors Vite replacing the virtual module. */
export function setDesignTokensStub(
  catalog: TokenDefinition[],
  generation: string,
): void {
  tokenCatalog = catalog;
  tokenGeneration = generation;
  const current = getNudgeUiRuntimeConfig();
  configureNudgeUiRuntime({
    ...current,
    tokenCatalog: catalog,
    tokenGeneration: generation,
  });
}

export default tokens;
