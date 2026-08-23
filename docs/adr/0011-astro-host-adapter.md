# ADR-0011: Astro host Adapter with response-level identity

Date: 2026-08-23
Status: Accepted

## Context

Design Tool reaches a browser document through three hosts: the Vite Adapter,
the standalone static HTML Adapter, and the Next.js Adapter. All populate one
runtime configuration Interface consumed by a single inspector runtime.

Astro projects cannot use any of the three hosts as-is. Astro is server-first:
`.astro` templates render to HTML with no component instance in the browser, so
no semantic runtime Adapter can rerender them. Astro sites do run on Vite, and
client islands (`client:load` and friends) hydrate real framework components —
typically React — inside an otherwise static document.

Astro's compiler annotates dev-mode elements with `data-astro-source-file` /
`data-astro-source-loc` when the dev toolbar is enabled. These attributes are
an undocumented compiler contract, and current Astro versions ship a toolbar
app that strips them from the DOM shortly after load. Reading them client-side
is therefore racy and version-dependent.

## Decision

Add an Astro host Adapter as a fourth host alongside Vite, standalone, and
Next.js, behind the existing `DesignToolRuntimeConfig` seam. No second
inspector is created. The user touchpoint is a `designToolAstro()` integration
in `astro.config`.

- **Identity is extracted from rendered dev HTML responses**, not from
  template transforms or client-side annotation reads. The integration's
  connect middleware buffers each dev-only HTML response, reads Astro's source
  annotations from the buffered markup, emits Design Tool's own identity layer
  (`data-cid`, `data-src`) alongside them, and forwards Astro's original
  attributes untouched. Server-side extraction is deterministic: it observes
  the annotations before any client script can remove them.
- **Rejected alternative — template transforms:** injecting attributes by
  transforming `.astro` sources would couple Design Tool to Astro's compiler
  internals for parsing and re-emission, risking template breakage for
  expressions, fragments, and spread attributes. It also duplicates identity
  that Astro already computes.
- **Rejected alternative — client-side capture:** copying the annotations into
  our own structures before the Audit app removes them races Astro's toolbar
  bundle ordering and fails entirely when annotations are absent.
- When annotations are absent (dev toolbar disabled or a future Astro change),
  elements receive generated `astro:<tag>` labels with no invented source
  location; prompts label such source as unknown.
- `.astro` components are an honest capability reduction: identified in the UI,
  not prop-editable (there is no runtime to rerender). Semantic component-prop
  projection remains available inside hydrated React islands, which carry the
  existing React Adapter instrumentation through the shared Vite plugin.
- Inspector bootstrap and token/component knowledge travel through Vite virtual
  modules registered via the integration's config update, because Astro's dev
  server is a Vite dev server. The mount element is created by the bootstrap
  module rather than injected into page markup.

ADR-0002 (dev-only gating), ADR-0003 (managed stylesheet), ADR-0005
(contextual selectors), ADR-0007 (semantic component prop projections), and
ADR-0008 (inline text projections) remain fully authoritative. The Astro
Adapter inherits their contracts unchanged; production builds are untouched
because every integration hook no-ops outside the dev command.

## Consequences

- Astro pages get CSS/token/text editing and prompt handoff on day one;
  island frameworks inherit their existing Adapter capabilities without new
  work per framework.
- Buffering dev HTML responses adds bounded latency to page loads in dev only;
  non-HTML responses are never buffered.
- Identity quality depends on Astro's undocumented annotation contract; the
  degraded path keeps the inspector honest rather than fabricating precision.
- Non-React islands (Vue, Svelte, Solid) remain deferred until their runtime
  Adapters exist.
