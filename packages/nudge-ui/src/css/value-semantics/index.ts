export { interpretValue } from "./structuredValues.ts";
export { isCalcExpression, isSingleVarReference, parseSingleVarReference } from "./cssSyntax.ts";
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
