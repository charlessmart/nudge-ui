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

export interface OpacityValue {
  value: string;
  authoredValue: string;
  tokenName: string | null;
  token?: TokenReference;
  /** False when the authored expression cannot be rewritten losslessly. */
  editable: boolean;
}

/** Derived by value semantics, never by React fields. */
export interface ColorValueFacts {
  /** The authored or resolved color already carries an alpha channel. */
  hasEmbeddedAlpha: boolean;
  /** The authored color is a compound expression that must remain raw unless separable. */
  isExpression: boolean;
  /** The authored shape can represent an opacity edit without losing meaning. */
  opacityEditable: boolean;
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
  layerOrder?: number;
  inheritedFrom?: string;
  inaccessibleStylesheet?: boolean;
  reason: string;
}

/** `name` is the human/design name, `cssName` the custom-property implementation name; they may differ and must not be conflated. */
export interface TokenEntry {
  name: string;
  value: string;
  source: string;
  /** Managed-preview CSS for tokens with no custom property (e.g. Tailwind v3 config literals). */
  cssValue?: string;
  adapter?: string;
  cssName?: string;
  origin?: TokenOrigin;
  editable?: boolean;
}

export type TokenContextWrapperKind = "media" | "supports" | "scope" | "layer";

/** One ordered stack preserves nesting and interleaving, including repeated kinds. */
export interface TokenContextWrapper {
  kind: TokenContextWrapperKind;
  params: string;
}

export interface TokenContext {
  selector?: string;
  wrappers?: TokenContextWrapper[];
}

export interface TokenDeclaration {
  id?: string;
  order?: number;
  value: string;
  source: string;
  important: boolean;
  context: TokenContext;
}

/** A grouped token with every authored declaration across the project. */
export interface TokenDefinition {
  cssName: string;
  name: string;
  declarations: TokenDeclaration[];
  cssValue?: string;
  adapter?: string;
  origin?: TokenOrigin;
  editable?: boolean;
}

export type TokenCatalogDiagnosticCode =
  | "vanilla-extract-contract-unresolved"
  | "vanilla-extract-contract-missing-export"
  | "vanilla-extract-contract-unsupported-shape"
  | "stylesheet-unreadable"
  | "stylesheet-unresolved"
  | "stylesheet-unsupported"
  | "stylesheet-parse-failed"
  | "transform-observation-failed"
  | "token-order-unresolved";

export interface TokenCatalogDiagnostic {
  code: TokenCatalogDiagnosticCode;
  message: string;
  module: string;
  exportName?: string;
}

/** Custom-property lookup table keyed by name and cssName. */
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

export interface AtRuleCandidate extends AtRuleContext {
  /** True when this context belongs to the declaration currently winning the cascade. */
  active: boolean;
}

export interface MatchedRule {
  selectorText: string;
  declarations: StyleDeclaration[];
  specificity: number;
  /** Runtime stylesheet identity, such as Vite's data-vite-dev-id. */
  source?: string;
  sourceOrder?: number;
  layer?: string;
  /** First-declaration order of the named cascade layer in this document. */
  layerOrder?: number;
  active?: boolean;
  atRules?: AtRuleContext[];
}

export interface ResolvedProperty {
  property: string;
  tokenName: string | null;
  declaredValue: string;
  resolvedValue: string;
  /** CSSOM serialization used as the authored expression; preserves CSS meaning, not source spelling. */
  authored?: string;
  sourceProperty?: string;
  computed?: string;
  tokens?: TokenReference[];
  opacity?: ColorOpacity;
  propertyOpacity?: OpacityValue;
  color?: ColorValueFacts;
  modifiers?: ValueModifier[];
  capability?: EditCapability;
  resolvedTokenValue?: string;
  diagnostic?: string;
  structure?: BorderStructure;
  /** Conditional wrappers affecting the declaration attributed to this field. */
  atRules?: AtRuleContext[];
  /** All media-query contexts found on declarations for this property. */
  atRuleCandidates?: AtRuleCandidate[];
  confidence: "exact" | "probable" | "unknown";
  evidence: AttributionEvidence;
}
