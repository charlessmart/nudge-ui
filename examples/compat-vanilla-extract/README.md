# Vanilla Extract compatibility fixture

This app is a real Vite + vanilla-extract + Sprinkles consumer of Design Tool.
It deliberately enables short generated identifiers so token attribution cannot
depend on semantic text surviving in a CSS variable or class name.

Run its complete compatibility contract from the repository root:

```sh
pnpm test:compat
```

The data-led contract lives in `src/scenarios.ts`. Each scenario identifies a
rendered element and declares the expected catalog entry, resolved property,
inspector control, and optional edit/prompt/revert behavior. Invariants compare
scenario snapshots for changes that must preserve meaning, such as unrelated
CSS import order and replacing the rendered DOM node.

Edit scenarios also prove the preview mechanism: the harness records the
managed stylesheet rule and browser verification result, checks that the
tracked element's inline style is unchanged, checks the change-row contents,
and requires the row to disappear after revert. Catalog declaration assertions
are read from the browser's CSSOM, including compiler-emitted values and theme
selectors rather than contract-variable placeholders.

To add coverage for another integration, create another app under `examples/`,
export a `CompatibilityManifest`, and pass it to `runCompatibilityManifest` in
a Playwright test. Keep framework/build-tool setup inside the fixture and put
shared assertions in `packages/compatibility`.
