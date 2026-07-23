# 0031 — Shared edit projection across preview documents

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer, edits made on the single Inspect page appear in every live
Canvas preview, including source-site overrides and theme-aware global token
changes, without each preview owning a divergent change log.

## What to build

Make the top-level canonical change set the sole edit authority for Canvas.
Serialize its full managed-stylesheet projection and distribute versioned
replacement messages to the current-route renderer. The renderer owns one
managed stylesheet in its document but never owns canonical changes.

Secure the protocol to the expected origin, parent window, project, workspace,
and card. A newly ready, reloaded, or HMR-replaced renderer receives the latest
complete projection. Refactor document-bound stylesheet helpers only as needed
to preserve ADR-0003 and ADR-0005 in every document.

Inspect-mode preview verification remains canonical. Frame match/application
diagnostics must not race to overwrite a change's top-level `previewResult`.

## Acceptance criteria

- [ ] The top-level controller sends a complete serialized CSS projection with a monotonically increasing revision
- [ ] The renderer replaces its entire `#design-tool-styles` content only for a newer revision
- [ ] Messages use an explicit target origin and validate origin, source window, protocol version, project ID, workspace ID and card ID
- [ ] An edit made before Canvas opens is present when the current-route frame becomes ready
- [ ] Later Inspect edits update an already-loaded preview without reloading the host application
- [ ] Source-site element edits retain their stable `data-cid` + `data-src` selectors in the frame
- [ ] Global token edits retain selector and media/supports/scope/layer context and update all matching frame consumers
- [ ] Each document has at most one managed stylesheet and no tracked host element receives an inline style
- [ ] Renderer reload and Vite HMR readiness converge on the latest full projection
- [ ] Empty, reverted, undone and cleared canonical states replace frame CSS rather than leaving stale rules
- [ ] Frame diagnostics remain separate from Inspect-mode canonical preview verification
- [ ] Unit tests cover protocol validation, revision ordering and CSS replacement
- [ ] Playwright edits an element and a global token, verifies both in the live frame, reloads the frame, and verifies convergence
- [ ] Production output remains free of the controller/renderer protocol and managed preview rules
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0030 — Live Canvas runtime and current-route preview
- #0022 — Global tokens tab with theme-aware editing

