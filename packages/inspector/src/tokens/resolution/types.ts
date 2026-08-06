/**
 * Migration compatibility re-export (slice 3.1).
 *
 * The canonical shared value/token knowledge types now live in
 * `@design-tool/css/model`. This module re-exports them from the old location
 * so the legacy resolver and callers keep compiling during migration. Later
 * slices (3.2–3.6) move callers behind the value-semantics Interface and this
 * temporary compat export is removed.
 */
export type {
  AtRuleContext,
  AtRuleKind,
  AttributionEvidence,
  BorderStructure,
  ColorOpacity,
  ColorValueFacts,
  EditCapability,
  MatchedRule,
  ResolvedProperty,
  StyleDeclaration,
  TokenOrigin,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "@design-tool/css/model";
