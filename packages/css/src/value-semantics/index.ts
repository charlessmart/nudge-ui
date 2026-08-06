/**
 * Browser-safe value-semantics seam for `@design-tool/css`.
 *
 * Slices 3.2–3.5 ship the real implementations behind this seam: the token
 * interpreter (`tokenInterpretation.ts`) owns token references, aliases,
 * leaf-token selection, cycles, and modifiers; the property/value policy
 * (`propertyPolicy.ts`) owns capability classification, property→semantic-slot
 * knowledge, presentation grouping, and compatible-token candidate selection;
 * the color semantics (`colorSemantics.ts`) owns color format recognition,
 * embedded alpha, opacity modifiers, `color-mix()` handling, and
 * meaning-preserving opacity/token edits; the structured-values Module
 * (`structuredValues.ts`) owns box, border, border-radius, logical-side, and
 * supported font decomposition. The migration comparison harness in
 * `@design-tool/inspector` exercises the seam against the conformance corpus.
 *
 * Browser-safe contract: this module imports only the shared model and must
 * never pull React, Vite, PostCSS, Node, or filesystem code into a bundle.
 */
import type { EditCapability, TokenTable, ValueModifier } from "../model/index.ts";
import type { Directionality } from "./boxSemantics.ts";

export * from "./tokenInterpretation.ts";
export * from "./propertyPolicy.ts";
export * from "./colorSemantics.ts";
export { interpretStructuredValue } from "./structuredValues.ts";
export type { StructuredField, StructuredValuesContext } from "./structuredValues.ts";
export type { Directionality } from "./boxSemantics.ts";

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
  /**
   * Explicit writing-mode/direction facts used by the structured-values Module
   * to map logical sides. Supplied by the integration from the selected
   * element's computed style; the Module never reads the DOM.
   */
  directionality?: Directionality;
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
