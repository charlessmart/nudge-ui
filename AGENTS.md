# AGENTS.md

Guidance for AI coding agents working on this repository.

## Project overview

Nudge UI is a development-only visual inspector for editing UI in the browser.
It identifies rendered elements, explains their live CSS, previews changes, and
creates a structured prompt for a coding agent. It does not edit application
source files. Production builds receive no inspector bootstrap, identity
attributes, or token data.

## Tech stack

This is a strict TypeScript and ES modules pnpm 10 workspace running on Node.js
22.12 or newer; published packages target Node.js 20 or newer. It uses Vite,
React, and framework adapters for Next.js, Astro, and static HTML, with Vitest,
Playwright, ESLint, Oxlint, and the repository's anti-slop rules for testing and
validation; shared compiler settings live in `tsconfig.base.json`.

## Repository layout

### Runtime packages

Runtime packages live under `packages/`. Inspect that directory and its package
manifests for the current package boundaries.

### Public application

- `landing` — the explicit public landing-demo artifact.

### Consumer applications

Consumer applications and fixtures live under `examples/`. Inspect that
directory and its package manifests for the current structure.

### Documentation and tooling

Architecture decisions live under `docs/adr/`; repository tooling lives under
`tools/`.

## Commands and verification

Use the scripts in the root `package.json` for repository-wide checks and
inspect package manifests for package-specific commands. The default CI path
runs package builds, type checking, linting, and the fast unit suite;
packed-consumer smoke tests run in a separate job, while UI integration,
browser, compatibility, and package verification remain targeted checks.
`pnpm lint:oxlint` is an optional, non-gating anti-slop lint for particularly
risky or low-signal code patterns.

Keep generated output out of changes. Build output (`dist/`, `build/`, and
`.next/`), Playwright output (`test-results/`), coverage, dependency folders,
and local tool configuration are ignored by the repository.


## ADRs

ADRs in `docs/adr/` are immutable once merged. To change a decision, write a
new ADR that supersedes it and update `docs/adr/README.md`. Never edit an
existing ADR.
