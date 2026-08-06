/**
 * Browser-safe value-semantics seam for `@design-tool/css`.
 *
 * This slice (3.1) establishes the *shape* of the value-semantics Interface:
 * a small typed `interpretValue` function that turns one CSSOM-authored value
 * into a structured semantic model. No interpretation implementation ships
 * here yet — slices 3.2–3.6 move the current resolver behavior behind this
 * seam, and the migration comparison harness in `@design-tool/inspector`
 * exercises it against the conformance corpus with a legacy-delegating
 * interpreter until then.
 *
 * Browser-safe contract: this module imports only the shared model and must
 * never pull React, Vite, PostCSS, Node, or filesystem code into a bundle.
 */
import type { EditCapability, TokenTable, ValueModifier } from "../model/index.ts";

export type AttributionConfidence = "exact" | "probable" | "unknown";

/** The structured border components an interpreted border value exposes. */
export interface BorderStructureInterpretation {
  width: string;
  style: string;
  color: string;
}

/**
 * The structured interpretation of one authored CSSOM value.
 *
 * Invariants preserved by the Interface (see the Stage 3 plan):
 * - `authored` is CSSOM serialization, not exact source text;
 * - `tokens` retains every referenced token, even when `tokenName` selects
 *   one primary field token;
 * - fallbacks, expressions, and opacity remain explicit modifiers;
 * - capability is derived once from the interpretation;
 * - unsupported values stay `raw`/`composite` without invented structure;
 * - arbitrary input does not throw through the public seam.
 */
export interface ValueInterpretation {
  /** CSSOM-authored serialization of the interpreted value. */
  authored: string;
  /** The primary field token, or null when no color/spacing token is primary. */
  tokenName: string | null;
  /** Every referenced token name, including opacity and fallback tokens. */
  tokens: string[];
  /** Normalized opacity (percent) when the value carries an alpha component. */
  opacity: string | null;
  /** The token name backing the opacity component, when it is token-driven. */
  opacityTokenName: string | null;
  capability: EditCapability;
  modifiers: ValueModifier[];
  structure: BorderStructureInterpretation | null;
  /**
   * Attribution confidence derived from the interpretation itself (base:
   * token presence). Cascade "exact" upgrades from computed-style validation
   * remain owned by BrowserCssInspection, not this value module.
   */
  confidence: AttributionConfidence;
}

/** Facts the interpretation needs that are not part of the authored text. */
export interface InterpretationContext {
  /** Resolved token table (custom-property name → entry). */
  table: TokenTable;
  /** Local aliases collected from the selected element's cascade. */
  localAliases?: ReadonlyMap<string, string>;
  /**
   * The source declaration property when the interpreted value is a projected
   * longhand of a shorthand (for example `sourceProperty: "border"` for a
   * `border-top-width` field). Defaults to `property`.
   */
  sourceProperty?: string;
}

/**
 * The value-semantics seam. `interpretValue(property, authored, ctx)` returns
 * the structured semantic model for one authored value.
 */
export type ValueInterpreter = (
  property: string,
  authored: string,
  ctx: InterpretationContext,
) => ValueInterpretation;
