# ADR-0016: Keep the public landing package outside examples

- Status: Accepted
- Date: 2026-09-05
- Supersedes: ADR-0001 and ADR-0014 for the landing application's repository placement only

## Context

The public landing page is a product surface and an independently deployed
artifact. The applications under `examples/*` are consumer fixtures used to
demonstrate and test the frameworks and build tools that Nudge supports. The
landing application has a different purpose: it presents Nudge and hosts the
explicit public inspector demo.

Keeping both kinds of application under `examples/*` makes the repository
layout imply that the landing page is another consumer fixture.

## Decision

The public landing application lives in the top-level `landing/` workspace
package. The `examples/*` workspace remains reserved for framework and build
tool consumer fixtures.

The landing package keeps its own Vite, Playwright, and type-checking setup and
continues to use the `dev:landing` and `build:landing` root scripts. Its
explicit `nudge-demo` behavior and runtime boundaries remain governed by
ADR-0014 and ADR-0015.

## Consequences

- The repository layout distinguishes the public product surface from test
  and compatibility fixtures.
- A root `pnpm install` still links the landing package and all runtime
  packages through the workspace protocol.
- Landing package commands continue to work through the root scripts and the
  package's own scripts.
