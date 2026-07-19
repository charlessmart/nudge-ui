export interface TokenEntry {
  name: string;
  value: string;
  source: string;
  /**
   * CSS to place in a managed preview when this token has no CSS custom
   * property. Tailwind v3 config tokens compile to literals, for example.
   */
  cssValue?: string;
  adapter?: string;
  cssName?: string;
  origin?: "project" | "framework" | "generated" | "runtime";
  editable?: boolean;
}

export interface TokenContext {
  selector?: string;
  media?: string;
  supports?: string;
  scope?: string;
  layer?: string;
}

export interface TokenDeclaration {
  id?: string;
  order?: number;
  value: string;
  source: string;
  important: boolean;
  context: TokenContext;
}

export interface TokenDefinition {
  cssName: string;
  name: string;
  declarations: TokenDeclaration[];
  cssValue?: string;
  adapter?: string;
  origin?: "project" | "framework" | "generated" | "runtime";
  editable?: boolean;
}

export const tokenTable: Record<string, TokenEntry> = {};

/** Authoritative contextual inventory. Runtime values still come from CSS. */
export const tokenCatalog: TokenDefinition[] = [];

export default tokenTable;
