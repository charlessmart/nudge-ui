# 0024 — Token conformance harness and standard-CSS baseline corpus

**Labels:** needs-triage
**Type:** AFK
**Milestone:** Token inventory and CSS-value fidelity

## User story

As a maintainer extending token inspection, I can add a small fixture that
asserts token inventory, authored attribution, computed browser value, and
managed-preview behavior together. This lets the project make CSS support
claims through executable examples instead of regressible one-off fixes.

## What to build

Create the initial conformance harness described in
`docs/features/token-inventory-conformance-harness.md`. It must run a tiny,
marked ordinary-CSS fixture through the same token inventory and inspector
resolution path used by the sandbox.

The fixture runner is a test seam, not a second application architecture. A
fixture provides source styles, a selectable host element, and expectations;
the harness verifies catalog, attribution, browser rendering, and—where the
value is editable—the managed stylesheet preview. Keep build-tool-specific
setup behind future fixtures rather than adding it to the generic runner.

Establish the first standard-CSS corpus with focused cases for:

- direct `:root` tokens;
- aliases, fallbacks, and cycles;
- root theme variants and active media/layer contexts;
- component-local custom properties that must not enter the global catalog;
- physical and logical spacing declarations;
- pixel, relative, percentage, and unitless values;
- an unsupported/composite value that remains an honest raw fallback;
- one known token-backed editable declaration that round-trips through the
  managed stylesheet, change set, and computed browser style.

Use the browser's computed style only as the rendering oracle. Preserve the
fixture's authored values as separate expected facts.

## Acceptance criteria

- [x] A reusable fixture format and runner exist for token conformance tests;
      new cases do not need bespoke Playwright control flow.
- [x] Each fixture can assert catalog entries, selected-element authored
      attribution, computed browser output, confidence/capability, and optional
      managed-preview output.
- [x] The standard-CSS baseline corpus covers every case listed above.
- [x] At least one fixture is exercised by both fast unit tests and a browser
      Playwright test against the real inspector path.
- [x] A computed CSS value cannot satisfy an authored-value expectation by
      itself.
- [x] Existing token extraction, contextual catalog, managed stylesheet, and
      production dev-only tests remain green.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, relevant Playwright tests, and
      `pnpm --filter sandbox build` pass.

## Blocked by

None — can start immediately.
