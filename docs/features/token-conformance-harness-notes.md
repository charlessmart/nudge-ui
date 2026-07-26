# Conformance harness implementation notes

These notes capture follow-up ideas found while implementing issues 0024–0029.

## What the current seam proves

- `runConformanceFixture()` owns fixture mounting, CSSOM inspection, catalog rows,
  and optional managed-preview setup. Assertions stay data-led and do not need
  bespoke DOM control flow.
- `ResolvedProperty` keeps compatibility fields (`declaredValue` and
  `resolvedValue`) while exposing CSSOM-declared text as the authored value,
  computed text, token origins,
  modifiers, capability, and diagnostics independently.
- Adapter entries carry both a human name and the CSS implementation name. The
  managed stylesheet always writes the latter; prompts and UI can use the former.
- Tailwind v4, Tailwind v3, and vanilla-extract/Sprinkles all contribute to the
  common token table. They do not create separate inspector experiences.

## Follow-up improvements

1. Add a first-class browser-side `inspectFixture(id)` debug endpoint. Current
   Playwright fixtures intentionally assert through the inspector UI and page
   CSSOM, but a small read-only endpoint would make authored/computed/capability
   assertions less brittle than querying shadow-DOM markup.
2. Have adapters emit class-to-token metadata during compilation. The current
   Tailwind v3 direct-RGB matcher is deliberately conservative and the Sprinkles
   fixture accepts an explicit class map; compiler-emitted metadata would remove
   value-equivalence heuristics and support non-hex colors.
3. Make the fixture corpus a manifest of independent cases (one selected
   element per case) and generate both Vitest and Playwright cases from it. This
   will make adding CSS Modules or future framework fixtures additive instead of
   requiring another route/test pair.
4. Keep browser-computed values as assertions and previews only. In particular,
   never use computed serialization as the initial value for `calc()`, aliases,
   color-mix(), or opacity-helper fields.

## Fixture projection contract

Fixtures can now assert two related contracts:

- `expected.properties` describes resolver facts such as authored value,
  token references, capability, and computed value.
- `expected.projection` describes the inspector-facing physical controls,
  including linked/unlinked side state, displayed values, token names, and the
  logical source property that produced each side.

The browser fixtures should still select the real element and query the
inspector shadow DOM. The projection contract makes the mapping reusable in
fast tests; the browser assertion proves React renders those projected values
through the actual controls.

Logical spacing declarations are normalized to physical sides using the
selected element's direction and writing mode. This prevents framework reset
rules such as `padding: 0` from hiding authored `padding-inline` values.

## Verification status

The repository-wide lint, typecheck, unit suite, sandbox production build, and
the nine new conformance Playwright tests pass. The sandbox Vite config loads
the workspace plugin source directly so the dev server does not ask Node to
execute the package's unbundled TypeScript entry during browser startup.

The remaining evidence gap is the existing work-codebase verification from
issue 0013; that external application is not part of this repository. The
Sprinkles fixture deliberately covers the adapter contract without claiming to
replace that check.
