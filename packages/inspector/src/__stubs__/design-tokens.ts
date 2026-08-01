export interface TokenEntry {
  name: string;
  value: string;
  source: string;
  cssValue?: string;
  adapter?: string;
  cssName?: string;
  origin?: "project" | "package" | "framework" | "generated" | "runtime";
  editable?: boolean;
}
export type TokenContextWrapperKind = "media" | "supports" | "scope" | "layer";
export interface TokenContextWrapper { kind: TokenContextWrapperKind; params: string }
export interface TokenContext { selector?: string; wrappers?: TokenContextWrapper[] }
export interface TokenDeclaration { id?: string; order?: number; value: string; source: string; important: boolean; context: TokenContext }
export interface TokenDefinition { cssName: string; name: string; declarations: TokenDeclaration[]; cssValue?: string; adapter?: string; origin?: "project" | "package" | "framework" | "generated" | "runtime"; editable?: boolean }
export interface TokenCatalogDiagnostic { code: "vanilla-extract-contract-unresolved" | "vanilla-extract-contract-missing-export" | "vanilla-extract-contract-unsupported-shape"; message: string; module: string; exportName?: string }

export const tokens: TokenEntry[] = [];
export const tokenCatalog: TokenDefinition[] = [];
export const tokenDiagnostics: TokenCatalogDiagnostic[] = [];
export const designToolProjectId = "/stub/project";
export default tokens;
