import type { TokenEntry, TokenOrigin } from "../model/index.ts";

export type DialectName = "tailwind-v3" | "tailwind-v4" | "vanilla-extract";

/** What a class that applies a token means, e.g. `bg-brand/40`. */
export interface DialectClassReading {
  /** The properties the class sets; a reading only explains a row for one of these. */
  readonly properties: readonly string[];
  readonly tokenCssName: string;
  /** The class's value written in terms of the token. */
  readonly expression: string;
  /** Percent-suffixed. */
  readonly alpha?: string;
}

/** One way of writing styles. Plain CSS is the absence of a dialect (ADR-0048). */
export interface StylingDialect {
  readonly name: DialectName;
  readonly label: string;
  /** Omitted when only configuration or a contract can prove the dialect. */
  detectStylesheet?(css: string): boolean;
  /** For tokens that carry no origin of their own. */
  readonly tokenOrigin: TokenOrigin;
  /** Tokens are values compiled into rules, with no custom property to probe. */
  readonly literalTokens: boolean;
  /** The contract only names variables, so declarations are read back from the page's stylesheets. */
  readonly declaredOnPage: boolean;
  /** Custom properties the dialect generates as plumbing rather than as tokens. */
  isInternalProperty?(name: string): boolean;
  readClass?(className: string): DialectClassReading | null;
  /** How source applies the token to the property, when the dialect has one fixed form. */
  sourceForm?(token: Pick<TokenEntry, "name" | "cssName">, property: string): string | null;
  /** Read by an agent: how edits in this dialect should be written. */
  readonly promptGuidance: string;
}
