import type { TokenEntry } from "virtual:design-tokens";

export interface ResolvedProperty {
  property: string;
  tokenName: string | null;
  declaredValue: string;
  resolvedValue: string;
  /**
   * CSSOM-declared serialization used by the UI as the authored expression.
   * This preserves CSS meaning, not the source file's exact spelling.
   */
  authored?: string;
  sourceProperty?: string;
  computed?: string;
  tokens?: TokenReference[];
  opacity?: ColorOpacity;
  modifiers?: ValueModifier[];
  capability?: EditCapability;
  resolvedTokenValue?: string;
  diagnostic?: string;
  structure?: BorderStructure;
  /**
   * Conditional source wrappers that apply to the declaration currently
   * attributed to this field. These include responsive, container, and
   * capability conditions which can affect the winning declaration.
   */
  atRules?: AtRuleContext[];
  confidence: "exact" | "probable" | "unknown";
  evidence: AttributionEvidence;
}

export type TokenOrigin = "project" | "package" | "framework" | "generated" | "runtime";
export type EditCapability = "atomic" | "color" | "box-sides" | "structured" | "composite" | "raw";
export interface TokenReference { name: string; origin: TokenOrigin }
export interface ValueModifier { kind: "alpha" | "fallback" | "expression"; value: string }
export interface ColorOpacity {
  value: string;
  authoredValue: string;
  source: "hex" | "rgb" | "hsl" | "color-mix";
  tokenName: string | null;
  token?: TokenReference;
}
export interface BorderStructure {
  kind: "border";
  sourceProperty: "border" | "border-top" | "border-right" | "border-bottom" | "border-left";
  width: string;
  style: string;
  color: string;
  colorTokenName: string | null;
}

export interface AttributionEvidence {
  selector?: string;
  sourceOrder?: number;
  specificity?: number;
  important?: boolean;
  layer?: string;
  inheritedFrom?: string;
  inaccessibleStylesheet?: boolean;
  reason: string;
}

export interface TokenTable {
  [varName: string]: TokenEntry;
}

export interface StyleDeclaration {
  property: string;
  value: string;
  important?: boolean;
}

export type AtRuleKind = "media" | "container" | "supports";

/** A conditional wrapper retained from CSSOM in source nesting order. */
export interface AtRuleContext {
  kind: AtRuleKind;
  /** The CSSOM-normalised prelude, without the leading `@kind`. */
  params: string;
}

export interface MatchedRule {
  selectorText: string;
  declarations: StyleDeclaration[];
  specificity: number;
  /** Runtime stylesheet identity, such as Vite's data-vite-dev-id. */
  source?: string;
  sourceOrder?: number;
  layer?: string;
  active?: boolean;
  atRules?: AtRuleContext[];
}
