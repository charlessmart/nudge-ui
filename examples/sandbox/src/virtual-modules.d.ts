declare module "virtual:design-tokens" {
  export interface TokenEntry {
    name: string;
    value: string;
    source: string;
    adapter?: string;
  }
  export interface TokenContext { selector?: string; media?: string; supports?: string; scope?: string; layer?: string }
  export interface TokenDeclaration { id?: string; order?: number; value: string; source: string; important: boolean; context: TokenContext }
  export interface TokenDefinition { cssName: string; name: string; declarations: TokenDeclaration[] }
  export const tokens: TokenEntry[];
  export const tokenCatalog: TokenDefinition[];
  export default tokens;
}
