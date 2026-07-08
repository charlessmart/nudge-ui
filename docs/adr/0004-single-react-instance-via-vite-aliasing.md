# ADR-0004: Single React instance via Vite aliasing

Date: 2026-07-08
Status: Accepted

## Context

PLAN.md "UI isolation" decision: "Use host's React instance via Vite aliasing if
possible; fall back to bundling a separate React (~40KB) for version safety." Two
React instances in the same page cause hooks to misbehave and context providers
to split.

## Decision

Alias the inspector's `react` and `react-dom` imports to the host app's resolved
`react` / `react-dom` via Vite `resolve.alias`. This keeps one React instance at
runtime and the inspector can read the host's fiber tree natively.

The fallback (bundling a separate React for Shadow DOM) is reserved for a version-
mismatch failure mode we have not observed yet. If we hit it, ADR-0004 will be
superseded by a new ADR documenting the failure case and the bundling choice.

## Consequences

- Inspector code must not assume a private React; no `React.createPortal` to a
  portal root owned by a different reconciler.
- The plugin owns the alias config; users opting out of the inspector keep the
  host's React untouched.

## Verification

- A Playwright e2e (Milestone 2) mounts the inspector, inspects the sandbox app,
  and asserts `window.React` identity matches the inspector's `React` import.