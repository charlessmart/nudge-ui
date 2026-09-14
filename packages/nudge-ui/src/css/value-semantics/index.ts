/**
 * Browser-safe value-semantics seam for `nudge-ui/css`.
 *
 * The Interface has three conceptual operations: interpret one authored value,
 * select compatible tokens, and apply a meaning-preserving edit. Token, color,
 * property-family, and structured parsers remain internal Implementation seams.
 * Framework-specific attribution arrives as explicit Adapter facts in the
 * interpretation context.
 *
 * Browser-safe contract: this module imports only the shared model and must
 * never pull React, Vite, PostCSS, Node, or filesystem code into a bundle.
 */
export { interpretValue } from "./structuredValues.ts";
export type { StructuredField as InterpretedValueField, StructuredValuesContext as ValueSemanticsContext } from "./structuredValues.ts";
export type { Directionality } from "./boxSemantics.ts";
export type {
  AliasAttribution,
  AliasInnerResult,
  TokenInterpretationContext,
} from "./tokenInterpretation.ts";

export {
  selectTokens,
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
} from "./propertyPolicy.ts";
export type {
  CssValueGrammar,
  TokenCandidate,
  TokenGroup,
  TokenSelection,
  TokenSelectionRequest,
  TokenSemanticSlot,
} from "./propertyPolicy.ts";

export { applyValueEdit, normalizeOpacityPercent } from "./colorSemantics.ts";
export type { ColorEditResult, ValueEditRequest } from "./colorSemantics.ts";
