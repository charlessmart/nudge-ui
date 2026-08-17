# 0059 — Inline text input and reconciliation hardening

**Labels:** enhancement, ready-for-agent
**Type:** AFK
**Milestone:** 6 — Inline text editing

## Parent

- `docs/features/inline-text-editing.md`

## What to build

Extend the proven inline editor to text nodes inside icon-plus-label and other
safe mixed output without replacing descendant markup. Harden native input for
plain-text paste, IME composition, spellcheck/replacement, selection ranges,
interactive host events, focus transitions, and framework reconciliation.

Keep temporary wrappers and editing attributes private to the editing session;
they must always restore the original DOM and never become durable identity.

## Acceptance criteria

- [x] An exact text node inside safe mixed markup can be edited without losing
      icons, descendants, event handlers, accessibility, or layout structure.
- [x] Plain typing, selection replacement, character deletion, plaintext
      paste, autocorrect/spellcheck replacement, and IME composition produce
      one correct canonical change per session.
- [x] Paragraph/rich formatting and input ranges escaping the editing host are
      rejected without corrupting the page or canonical state.
- [x] Interactive elements do not activate application actions while editing;
      normal behaviour returns after commit or cancel.
- [x] Focus loss, route/frame disposal, application rerender, and selection
      removal end the session deterministically with correct diagnostics.
- [x] Temporary contenteditable state, wrappers, markers, spellcheck changes,
      listeners, and selections are restored on every exit path.
- [x] Unit tests cover input policy and lifecycle cleanup; Playwright covers
      nested icon/label, paste, composition-capable event flow, app click
      suppression, reconciliation, and Canvas focus/disposal.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with the dev-only contract held.

## Evidence

- `inlineTextEditor.test.ts` covers 31 input/lifecycle tests: exact mixed
  icon/label node identity, native typing/deletion/replacement, plaintext and
  clipboard-fallback paste, paragraph/rich/cross-host/unknown-input rejection,
  non-cancelable input recovery, deferred IME composition, inherited
  spellcheck state, native pointer/default preservation with host bubbling
  suppression, outside-click blur/action suppression, conditional focus,
  clear-time cancellation, asynchronous reconciliation, push/replace/pop/hash
  route disposal, and controller-owned Canvas disposal. `textProjection.test.ts`
  covers 8 exact-node projection/independent-marker/no-reapply cases;
  `textContentChange.test.ts` covers 6 canonical path/merge cases;
  `textBinding.test.ts` covers 16 binding decisions; `changeAction.test.ts`
  covers 4 semantic projection guards; and `sessionStore.test.ts` covers 55
  persistence/protocol cases including v7 structural migration and mixed
  text-node path round trips (104/104 focused tests pass).
- `m6-inline-text.dev.spec.ts` covers 15/15 Playwright flows, including nested
  icon/label preservation, plaintext paste, IME-capable events, native
  outside-click commit with suppressed app action, click suppression, app
  reconciliation, pushState route disposal, active-session Canvas transition,
  and Canvas reload cleanup.
- `pnpm lint` and full `pnpm typecheck` pass. `pnpm --filter sandbox build`
  passes and an `rg` scan of `examples/sandbox/dist` finds no
  `data-dt-inline-editor`, `data-dt-projection-text`, `data-cid`, `data-src`, or
  `data-cprops` production markers.
- The changed 0059 files pass targeted Oxlint. Repository `pnpm lint:oxlint`
  remains non-zero only for the pre-existing
  `packages/inspector/src/selectedGeometry.ts:13:90`
  `require-safety-comment-for-type-assertion` error (the full command also
  reports existing warnings). The full inspector Vitest run is 1070/1072,
  retaining the two pre-existing `Clear Session` assertions against the
  current `Clear Changes` label in `ChangesLog.test.tsx` and
  `InspectorShell.test.tsx`.

## Blocked by

- 0058 — Repeated component text binding.
