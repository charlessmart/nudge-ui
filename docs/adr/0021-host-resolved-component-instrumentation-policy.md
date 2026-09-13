# ADR-0021: Host-resolved component instrumentation policy

Date: 2026-09-12
Status: Accepted
Supersedes: the ADR-0001 note that `packages/plugin` houses the AST transform

## Context

The React identity compiler decides which JSX elements may be replaced by a
semantic component boundary. Its first implementation recognised a hard-coded
set of framework import specifiers (React, React Router) inside the Vite plugin.
A QA sweep of packed consumers showed why that shape fails: wrapping React
Router's structural `Route` element changes `element.type`, tripping React
Router's `is not a <Route> component` invariant and rendering a blank root.
The same class of failure applies to any structural library whose interface is
the element's identity rather than its props.

The replacement that shipped next failed closed for everything the compiler
could not prove local, which published a different problem: aliased project
imports (`@/components/ui/button`), re-export barrels, workspace packages, and
factory definitions (`styled.button`, `lazy(...)`) all lost semantic
instrumentation silently. The Vite and Next.js Adapters also needed the same
knowledge — import provenance, source ownership, stable paths — with different
resolvers.

## Decision

**Split syntax from resolution.** `@nudge-ui/compiler` owns parsing, JSX
walking, and re-export tracing. A host Adapter supplies a
`ComponentModuleAdapter` (`resolve`, `read`, `isProjectSource`, `sourcePath`)
and receives a data-only `HostComponentPolicy`. The compiler never knows a
bundler, a filesystem, or a framework name.

**Express compatibility as catalog data, not control flow.**
`ComponentProtocol` records whether a component's element type may be replaced
(`wrap`) and which JSX-valued slots (`slots`) render their contents. Protocols
are keyed by resolved module specifier and export name and merged over
`defaultReactComponentProtocols`, so React Router support is one catalog entry
rather than a compiler branch. Hosts add or override entries with
`componentProtocols`; the older `compatibleComponentImports` shorthand remains
for leaf exports that render no JSX slots.

**Project-owned definitions render their authored children.** A component that
traces to project source resolves to `wrap: true` with
`children: "rendered"`; a definition authored in the same module gets the same
treatment. The inspected codebase owns these definitions, so replacing the
element type is safe and its children are authored locally. Named JSX props
stay opaque unless a host protocol declares that slot, and any subtree whose
component resolves to an unknown package protocol stays untouched.

**Identity paths are project-root relative.** A file outside the project root
records a `../`-prefixed relative path (`../../packages/ui/src/Button.tsx`)
rather than an absolute machine path or a per-source-root path. Identity stays
unique across workspace packages, readable in a prompt, and identical between
the Vite and Next.js Adapters.

**Authored workspace scope is explicit.** `sourceRoots` marks workspace
directories as project-owned for identity, contracts, and stylesheet
provenance. Dependencies and generated output stay excluded; a declared source
root outranks the repository-tooling path exclusion in the Next.js Adapter.

**Skipped semantics are reported.** Unresolved imports, unknown package
protocols, and untraceable exports produce `ComponentPolicyDiagnostic` records,
which both Adapters roll up into one warning per source.

## Consequences

- Any structural library is supportable by declaring a protocol; no framework
  needs a compiler branch again.
- Project JSX-heavy pages keep semantic callsites through component nesting,
  while third-party subtrees remain byte-preserved.
- Component instrumentation depends on host resolution. A host that supplies no
  policy instruments only same-module definitions and explicitly compatible
  exports, and both Adapters warn when a required capability is missing.
- `compatibleComponentImports` no longer implies that children or named slots
  are transparent; that requires an explicit protocol.
- Policy resolution reads and parses imported modules. A content-addressed
  analysis cache keeps repeated transforms of unchanged modules off the HMR hot
  path.
- Test suites for the compiler behaviour belong to `packages/compiler`; the
  Vite Adapter keeps only its legacy subpath contract.

## Verification

- Compiler unit tests cover aliased imports, structural re-exports, the
  project-owned default, host overrides, failure diagnostics, and identity
  paths outside the project root.
- Vite and Next.js unit tests cover host-resolution wiring, `sourceRoots`
  scope, runtime aliasing, and the Turbopack rule condition.
- The packed consumer suite exercises the installer and both compiler seams
  against published tarballs.
