# 1 — Vite plugin scaffold + sandbox app + `data-cid` injection

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 1 — Foundation

## Parent

None — this is the root slice for the Design Tool plan (PLAN.md Milestone 1).

## What to build

Establish the Vite plugin package architecture and the first verified end-to-end path: a Vite plugin that visits JSX AST in `.tsx`/`.jsx` files and injects `data-cid` (the enclosing component/function name) on every JSX element in dev mode only. Ship a minimal sandbox app (React + CSS custom properties) to verify against. Confirm the tree-shaking contract: the injected attribute is absent from the production build.

This is the architectural anchor slice — package layout, the `import.meta.env.DEV` gating convention, the AST-visitor pattern, and the build-verification workflow all land here and set the pattern every later slice follows.

## Acceptance criteria

- [x] Vite plugin package scaffolded with a working `transform` hook for `.tsx`/`.jsx` files
- [x] AST visitor injects `data-cid` set to the enclosing function/class component name on every JSX element
- [x] All plugin transforms gated behind `import.meta.env.DEV` (no stray dev-only code shipped to prod)
- [x] Sandbox app created: minimal React app using CSS custom properties (`:root { --... }`)
- [x] In dev build: DOM inspection shows `data-cid` on JSX elements
- [x] In production build: DOM inspection confirms `data-cid` is absent (tree-shaking verified)
- [x] Plugin configurable to be disabled (opt-out) so host apps aren't forced to adopt it

## Blocked by

None — can start immediately.