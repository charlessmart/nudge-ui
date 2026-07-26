# CSSOM-first style resolution

**Status:** Proposed

## Summary

Make CSSOM declaration serialization the sole runtime source for authored-style
resolution. Remove the secondary parser that scans same-document `<style>` text
and pairs recovered declarations back to CSSOM rules.

Keep the existing separation between:

- the CSSOM declaration that is used for attribution and token/shorthand
  interpretation;
- the browser-computed value used as the rendering oracle and preview; and
- the managed stylesheet used as the only preview-write surface.

The runtime should preserve the meaning needed by the inspector—`var()` calls,
fallbacks, aliases, calculations, shorthands, logical properties, and source
property provenance—without promising the exact lexical spelling originally
typed by the author.

## Why change it

The current collector has two declaration sources:

```text
same-document <style>.textContent
  → cssText.ts parser
  → selector-keyed recovered declarations

CSSStyleRule.style.cssText
  → CSSOM serialization fallback
```

`cssText.ts` is a second, partial CSS parser. Its recovered declarations are
selected with `selectorKey(...).shift()`, so the implementation must stay in
lockstep with browser parsing, grouping-rule traversal, duplicate selectors,
invalid declarations, CSSOM mutations, and future CSS syntax. A source parse
error can make correct CSSOM attribution look incorrect.

The product does not require lexical fidelity. CSSOM still exposes the declared
form of `calc()`, `min()`, `max()`, `clamp()`, `var()`, gradients, grid
functions, and shorthands. It may normalize whitespace, color syntax, numeric
notation, component order, or shorthand compression, which is acceptable for
the intended best-effort editor display.

## Architectural target

### Authoritative runtime path

```text
CSSStyleSheet.cssRules
  → CSSStyleRule.style declaration enumeration
  → MatchedRule.declarations
  → resolveDeclaration()
  → ResolvedProperty
  → editor projection / token attribution / prompt context

getComputedStyle(element)
  → ResolvedProperty.computed
  → preview, validation, and conflict evidence
```

The CSSOM stylesheet walk remains. It is required for selector matching,
specificity, source order, media/supports state, layers, inaccessible-sheet
handling, and cascade attribution. This proposal removes only the literal
source-text recovery path.

### Value-model contract

Retain `ResolvedProperty.authored` and `declaredValue` for compatibility, but
define them as the CSSOM-declared serialization rather than exact source text.
`computed` remains the browser-computed value. `resolvedTokenValue` continues
to represent the resolver’s token leaf value where applicable.

Do not rename the public fields in this migration. The important change is the
authority behind them and the documentation of their fidelity level.

### Optional future source inspection

If a future UX needs an exact source excerpt, add it as separate, optional
diagnostic metadata. It must not feed cascade selection, token resolution,
shorthand expansion, editor values, or prompt correctness. It should be
explicitly labelled as source text and allowed to be unavailable or stale.

Do not retain the current scanner in the main resolution path merely as a
fallback; that preserves the maintenance burden without improving semantic
resolution.

## Migration plan

### 1. Replace source recovery with CSSOM declaration enumeration

Update `packages/inspector/src/tokens/resolution/cssomCollector.ts`:

- remove `rawDeclarationsBySelector`, `selectorKey`, and the `raw` lookup;
- enumerate each `CSSStyleDeclaration` using `length`, `item()`,
  `getPropertyValue()`, and `getPropertyPriority()`;
- emit one `StyleDeclaration` per CSSOM declaration, preserving declaration
  order, custom-property names, and `!important`;
- continue walking grouping rules and computing active/cascade metadata exactly
  as today;
- treat CSSOM as authoritative about which declarations exist, so invalid
  declarations are naturally excluded by the browser.

This should allow `packages/inspector/src/tokens/resolution/cssText.ts` to be
deleted rather than leaving behind a parser that only parses CSSOM’s own
serialized output.

### 2. Preserve the existing resolver and UI seam

Do not change `resolveTokenValue()` or the shorthand projection algorithm as
part of the first migration. Their inputs remain declaration values such as:

```css
clamp(8px, 2vw, 24px)
var(--space-4, 20px)
padding: var(--space-4) var(--space-8)
repeat(auto-fit, minmax(12rem, 1fr))
```

The expected change is only that CSSOM may serialize those values canonically.
Token attribution and semantic decomposition should remain unchanged.

Retain the current editor policy:

- structured values use swatches, fields, selectors, or token chips;
- unsupported functional/composite values use a raw field;
- computed values are previews/fallbacks, not replacements for a declared
  expression when the editor needs that expression;
- numeric `calc()` cases that the existing policy deliberately simplifies may
  continue to display their computed numeric value.

### 3. Keep prompt behaviour honest

`generatePrompt()` does not consume `ResolvedProperty` directly. It consumes
change records. The only affected path is `sourceAuthoredValue`, which is
copied from a resolved row when a physical edit originated from a shorthand or
logical declaration.

Keep the field for compatibility, but describe it as a best-effort CSSOM
declaration context. Prompts should not imply that it is an exact source quote.
Token swaps, raw before/after values, selectors, file locations, and computed
preview conflicts remain unchanged.

### 4. Consolidate the separate inset read

`PositionAnchorControls.tsx` contains a second, independent CSSOM rule walk for
`inset` and physical position properties. It is not the source-text scanner,
but it duplicates authored-cascade logic.

After the collector migration, refactor this control to consume the resolved
rows or a shared resolver helper. This keeps one CSSOM attribution path and
prevents future fixes from being applied to one walk but not the other.

This is a follow-up within the same architectural change, not a reason to
remove the main CSSOM traversal.

### 5. Update documentation and conformance language

Revise the following documents so “authored” does not mean “byte-for-byte
source text”:

- `docs/features/grid-layout-controls.md` — remove the requirement for a
  brace-aware source scanner and define CSSOM declaration serialization as the
  authored fallback;
- `docs/features/token-conformance-harness-notes.md` and
  `docs/features/token-inventory-conformance-harness.md` — distinguish
  declared/CSSOM values from exact source excerpts;
- `docs/issues/0025-functional-token-values-and-edit-capability.md` — retain
  expression preservation semantically, but avoid requiring exact lexical
  preservation;
- `docs/issues/0027-simple-border-shorthand-decomposition.md` — describe
  shorthand retention as declaration/source-property context, not exact source
  spelling.

No ADR needs to change. ADR-0003 concerns the managed stylesheet write surface;
this proposal leaves that decision intact.

## Test plan

### Unit tests

- replace `cssText.test.ts` with CSSOM declaration-enumeration tests;
- assert declaration order, duplicate properties, custom properties, and
  `!important`;
- assert invalid declarations are absent rather than recovered from source;
- retain resolver tests for aliases, fallbacks, calculations, spacing
  shorthands, logical properties, border shorthands, and typography shorthands;
- add a regression test proving `clamp()`, `min()`, `max()`, `calc()`,
  `color-mix()`, and `repeat()/minmax()` remain expression-shaped after
  collection even when serialization normalizes whitespace.

### Browser tests

Keep semantic assertions for:

- token chips and token attribution;
- vertical/horizontal padding projection;
- raw fallback fields for unsupported functional values;
- grid track expressions;
- border and font shorthand decomposition;
- computed previews and managed stylesheet edits.

Relax tests that require a particular lexical color or whitespace spelling.
Where useful, assert that the value contains the expected function/token
identity rather than matching the original source string exactly.

### Required verification

Run:

```text
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm --filter sandbox build
```

Also verify that:

- no runtime resolver imports `cssText.ts`;
- no UI path requires exact source text to choose a control;
- no prompt path labels CSSOM serialization as an exact quote;
- production output remains free of inspector/token metadata;
- no tracked element receives inline styles.

## Recommended outcome

Choose full removal from the runtime path. CSSOM gives the project the semantic
declaration representation it needs, while the browser supplies the computed
rendering oracle. Keeping literal source recovery as a hidden fallback creates
two competing interpretations of CSS and makes the harder path authoritative
in precisely the cases where real-world syntax is most varied.

If exact source display becomes a product requirement later, add it as an
explicit, optional diagnostic adapter behind a separate seam.
