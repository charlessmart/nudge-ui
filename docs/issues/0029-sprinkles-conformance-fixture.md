# 0029 — vanilla-extract and Sprinkles conformance fixture

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a designer inspecting a Sprinkles-generated class, I see the project’s
human-readable theme-contract path and can verify that its rendered result,
managed preview, and generated prompt all refer to the same meaningful token.

## What to build

Bring the vanilla-extract/Sprinkles adapter work from issues 0012 and 0013
into the shared conformance harness. Add a minimal theme-contract fixture with
an atomic class consumer and assert the end-to-end contract: catalog origin,
human-readable token path, selected-element attribution, browser-computed
value, token swap preview, and prompt output.

This is a verification slice for the existing adapter roadmap. It must not
hardcode the work codebase's contract shape or substitute an opaque generated
custom-property name where a known contract path is available.

## Acceptance criteria

- [x] A minimal vanilla-extract/Sprinkles fixture is compiled and exercised by
      the common conformance runner.
- [x] An atomic consumer class resolves to its human-readable theme-contract
      path rather than only a generated CSS variable name.
- [x] The fixture asserts catalog provenance, attribution, browser-computed
      value, managed token-swap preview, change log, and prompt output.
- [x] The same fixture proves graceful fallback for an atomic class with no
      safe human-readable mapping.
- [ ] Existing work-codebase verification from issue 0013 remains part of the
      adapter's evidence; the fixture is not a substitute for it.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

- #0012 — vanilla-extract adapter: detect + token extraction
- #0013 — vanilla-extract resolveClassName + verify on work codebase
- #0024 — Token conformance harness and standard-CSS baseline corpus
