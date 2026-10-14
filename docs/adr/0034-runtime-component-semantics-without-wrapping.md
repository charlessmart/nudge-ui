# ADR-0034: Runtime component semantics without wrapping

Date: 2026-10-14
Status: Accepted
Supersedes: ADR-0021's rule that a subtree under an unknown package protocol
receives no semantic instrumentation

## Context

ADR-0021 lets the compiler replace a JSX element with a semantic boundary only
when it can prove the replacement is safe, and treats the children of any
package component with an unknown protocol as opaque. Both rules are correct
for wrapping: a parent that checks `child.type` or reads `child.props` breaks
when its child becomes a boundary.

In practice they removed component semantics from most applications built on
an npm design system. Designkit opens nearly every component file with a
design-system `<Box>` or `<Stack>`, so neither the package components nor any
project component nested inside them was wrapped. The panel showed no
component section for any element, although the compiler had already tagged
every callsite with `data-src` and the manifest held contracts for them.

Wrapping is only one way to reach a callsite at runtime. The identity tags are
ordinary props, and React keeps them on the component's fiber whether or not
the component forwards them to the DOM. React development builds also hand a
prop-editing toolkit to `__REACT_DEVTOOLS_GLOBAL_HOOK__`; React DevTools edits
props through it, and React 16 through 19 ship it.

## Decision

**Callsites the compiler cannot wrap are registered, not skipped.** For every
instrumented component callsite left unwrapped, the compiler emits its
invocation metadata into a per-module `registerReactCallsites([...])` call in
the same single prelude line as the runtime import. A callsite whose author
supplied their own `data-src` is not registered.

**The React runtime Adapter names tagged fibers.** Inspection walks from the
selected element's fiber to the root. Boundaries answer as before; any other
component fiber whose `data-src` prop names a registered callsite answers with
that metadata and its current props. Fibers of one callsite with no host
output between them (memo and forwardRef layers, a component spreading its
props into another) are one invocation owned by the outermost layer. Results
from both sources are merged nearest first, so the inspector sees one
ancestry. Multiplicity and root invocations for tagged callsites come from a
walk of the mounted tree, cached until the next commit.

**Live preview edits fiber props through the DevTools seam.** A classic inline
script in the document head records every renderer injected into the hook
(React Refresh's stub hook does not). Overrides are applied with one
whole-props `overrideProps` call per invocation, through the renderer that
committed the invocation's root only, and reapplied after any commit that
hands an invocation its authored props again. Each overridden prop keeps its
authored value and the override last applied; a rendered value that is not
that override came from the application and replaces the authored value.
Removing an override writes the authored value back.

**Without the seam, semantics degrade to prompt-only.** A target the runtime
can name but not edit reports `livePreview: false`; the panel says the change
goes to the prompt, and the change is recorded as usual.

Wrapping remains the path for callsites the compiler can prove safe. Protocol
catalogs and `componentProtocols` still decide wrapping; they no longer decide
whether a callsite is visible to the inspector.

## Consequences

- Package components and project components nested inside them get component
  sections and live prop preview in React applications without configuration.
- Nothing about the rendered element type changes for tagged callsites, so
  parents that inspect their children are unaffected.
- The runtime depends on two private React surfaces: fiber fields (already
  read for boundaries) and the DevTools renderer toolkit. A future React that
  removes the toolkit loses live preview for tagged callsites, not
  identification.
- The head script is injected by the Vite host, including demo dev serving.
  Hosts that do not inject it (Next.js, Astro without an HTML entry) identify
  tagged callsites but preview them only if another hook retains renderers,
  such as the DevTools extension. Demo builds ship production React, which has
  no prop-editing toolkit, so tagged callsites there are prompt-only.
- A root whose renderer is known but lacks the toolkit is prompt-only; the
  runtime never edits a fiber through another renderer.
- An identity tag that a component spreads into a nested component of its own
  is attributed to the outer callsite. That matches what the DOM attribute
  already reports.

## Verification

- Runtime tests render real React trees under jsdom with the capture script
  installed: nearest-first naming across memo/forwardRef layers,
  multiplicity, root invocations, live preview that survives parent renders,
  restoration of an authored value that changed during the override, and
  restoration after several overrides of the same prop.
- A separate test without any hook covers prompt-only targets; another covers
  renderer ownership, including a known owner without the toolkit.
- Compiler tests cover registration inside opaque package subtrees, the
  single-line prelude, and authored `data-src`; the Next.js loader test keeps
  registration after a `"use client"` directive. Vite host tests check that the
  plugin injects the capture script ahead of every other script, in demo mode
  too, and that a host without a framework injects none.
- A sandbox Playwright test (`package-component-props.dev.spec.ts`) joins the
  compiler and runtime: it selects the playground's `ThinkingOrb`, a package
  component, changes `state` twice, checks the rendered label, and reverts to
  the authored value.
