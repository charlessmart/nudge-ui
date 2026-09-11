# ADR-0018: Self-contained inspector client and host runtime Adapters

Date: 2026-09-10
Status: Accepted
Supersedes: ADR-0004 and the bootstrap transport decision in ADR-0011

## Context

ADR-0004 made the inspector share the application's React installation through
Vite aliases. That placed the complete inspector UI dependency graph inside
each host's bundler and optimizer. It also coupled two separate concerns:

- rendering Nudge UI's private interface; and
- observing and rerendering components owned by the host framework.

The coupling failed in an installed Astro application. The physical Astro
bootstrap imported Vite virtual modules, so dependency optimization could not
prebundle it. Excluding that graph then exposed CommonJS interoperability in
the inspector's UI dependencies and `react-dom/client`. React 18 and React 19
can both exhibit this failure because the cause is dependency-graph ownership,
not a specific React release.

Installer rewriting had a related shape assumption: it could only append an
Astro integration when `integrations` was an inline array literal.

## Decision

Ship the inspector UI as one prebuilt, self-contained ES module. The client
owns its private React, React DOM, Base UI, icons, and styles. A host Adapter
serves that immutable asset and a versioned, plain-data runtime manifest from
development-only routes. The client dependency graph does not pass through the
consumer's optimizer. The asset is compiled with its development gate enabled;
production safety comes from host Adapters registering no routes or injection
hooks outside development.

Keep framework semantics in small host runtime Adapters. The React Adapter uses
the host's React instance to install component boundaries, inspect the host
fiber tree, and apply prop overrides. A versioned page-global Interface joins
the independently built client and host graphs. The Interface accepts DOM
elements as transient inspection inputs and returns or accepts plain component
metadata, scalar prop values, multiplicity, and override commands. React
elements, contexts, hooks, and fibers never cross the seam.

Astro is the first host to use the new client transport. It serves the shared
client and a runtime manifest under `/__nudge_ui__/`, while its existing Vite
plugins continue to produce token knowledge, component contracts, and React
island instrumentation. Production hooks remain empty under ADR-0002.

Expose `withNudgeUi(config, options)` as Astro's installation Interface. The
wrapper treats the existing configuration as a value and appends the Adapter
at runtime. The installer wraps the default export instead of parsing or
rewriting the `integrations` property.

## Consequences

- Host React versions and optimizer interoperability no longer affect the
  inspector UI runtime.
- React component semantics still use the application's own React instance,
  where fiber and rerender ownership belong.
- The client costs one private React runtime download in development. This is
  an intentional isolation cost and has no production impact.
- New framework Adapters implement the same bounded host runtime Interface;
  they do not need to adopt the inspector's UI framework.
- Vite/React, Next.js, and standalone continue using their existing client
  delivery temporarily. A follow-up migration will move them onto the shared
  asset and manifest without changing the Interface.
- Existing Astro configs that call `nudgeUiAstro()` remain valid. New automated
  installs use the wrapper and support variable, shorthand, spread, and
  computed integration construction.

## Verification

- Unit tests cover manifest validation, Adapter replacement, and filtering of
  non-plain React props at the seam.
- Astro tests assert that injected bootstrap code references only the external
  client and manifest routes.
- The Astro consumer suite verifies Shadow DOM mounting and React-island
  component semantics.
- Package verification checks that the inspector tarball contains the client
  asset and that the asset has no external module imports.
