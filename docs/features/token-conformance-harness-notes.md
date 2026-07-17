# Conformance harness implementation notes

These notes capture follow-up ideas found while implementing issues 0024–0029.

## What the current seam proves

- `runConformanceFixture()` owns fixture mounting, CSSOM inspection, catalog rows,
  and optional managed-preview setup. Assertions stay data-led and do not need
  bespoke DOM control flow.
- `ResolvedProperty` keeps compatibility fields (`declaredValue` and
  `resolvedValue`) while exposing authored text, computed text, token origins,
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

## Verification limitation

The repository-wide lint, typecheck, unit suite, and sandbox production build
pass. Playwright dev-server checks could not start in this execution environment:
the unbundled workspace `@design-tool/plugin` TypeScript entry is rejected by
the Node loader when Vite starts the dev server. The browser test files are
committed and ready to run in the normal workspace toolchain; their issue
checklist items remain unchecked until that environment-level failure is fixed.
