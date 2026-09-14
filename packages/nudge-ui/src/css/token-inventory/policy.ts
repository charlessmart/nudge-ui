/**
 * Explicit inventory policies behind ordinary CSS parsing.
 *
 * Parsing must not bury heuristics as unexplained constants. This module names
 * each policy, documents its rationale, and pins both directions of the
 * trade-off with tests in `parseStylesheet.test.ts`.
 */

/**
 * At-rules that make a nested custom-property declaration global regardless of
 * an enclosing selector: `@theme` (Tailwind v4), `@layer`, and `@scope`.
 *
 * Deliberately NOT included: `@media`, `@supports`, and `@container`. A bare
 * custom property directly inside those wrappers (without `:root`/`:host`) is
 * not a global token — see the false-positive guards in the parsing tests.
 */
export const GLOBAL_TOKEN_AT_RULES = new Set(["theme", "layer", "scope"]);

/**
 * Minimum declaration count for a scoped rule to be treated as a theme table.
 *
 * Rationale: published design systems often scope an entire theme beneath a
 * class on the application shell (for example to support multiple themes on
 * one page) instead of `:root`. A rule that is large enough AND made entirely
 * of custom-property declarations is treated as a theme table, so its selector
 * is retained in the catalog and resolved against the selected element later.
 *
 * The threshold is a deliberately explicit policy with two documented edges,
 * both pinned by tests:
 *
 * - False positive: a component-local rule with many custom properties (at or
 *   above the threshold) is admitted as a theme table even though it is local
 *   to the component. Accepted so genuine multi-variable theme tables keep
 *   working; a cleaner fix needs selector heuristics that are out of scope for
 *   ordinary-CSS parsing.
 * - False negative: a real theme table with fewer than the threshold
 *   declarations is rejected. Accepted so small component-local rules do not
 *   leak into the global catalog.
 *
 * The threshold is a count of direct custom-property declarations on the rule,
 * not a line count and not an estimate of selector breadth.
 */
export const MIN_THEME_TABLE_DECLARATIONS = 8;

export interface ScopedThemeTablePolicy {
  readonly minDeclarations: number;
  readonly requiresOnlyCustomProperties: boolean;
  readonly rationale: string;
}

export const SCOPED_THEME_TABLE_POLICY: ScopedThemeTablePolicy = {
  minDeclarations: MIN_THEME_TABLE_DECLARATIONS,
  requiresOnlyCustomProperties: true,
  rationale:
    "A scoped rule is a theme table only when it is large enough and made entirely "
    + "of custom-property declarations. This admits multi-variable theme tables on "
    + "an application shell while keeping small component-local variable blocks out "
    + "of the global catalog. Both directions of the trade-off are pinned by tests "
    + "in parseStylesheet.test.ts.",
};
