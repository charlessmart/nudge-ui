/** Custom properties directly under these at-rules are global; `@media`, `@supports` and `@container` deliberately are not. */
export const GLOBAL_TOKEN_AT_RULES = new Set(["theme", "layer", "scope"]);

/** At or above this many direct custom-property declarations a scoped rule is treated as a theme table. */
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
