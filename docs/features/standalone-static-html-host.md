# Standalone static HTML host

**Status:** Approved implementation plan

**Sequence:** Runtime host configuration → HTML identity → standalone tracer bullet → token lifecycle → hardening

**Scope:** Framework-free HTML/CSS prototypes served by Design Tool; Inspect mode only

## Summary

Add a standalone host Adapter for users who create HTML/CSS prototypes without
Vite or another build tool. The user runs a Design Tool-owned local server:

```sh
design-tool serve ./prototype
```

The prototype remains ordinary HTML, CSS, JavaScript, and assets. The server
instruments HTML responses in memory, serves a self-contained inspector client,
publishes token knowledge, watches source files, and reloads the browser after
agent-authored changes. Design Tool continues to hand source changes to an agent
through the generated prompt; it does not write prototype files.

The server injects an external same-origin client module and does not inject
inline JavaScript or JSON. The current inspector still creates style elements
for its Shadow DOM UI and managed previews, so prototypes with a strict
`style-src` policy must permit those styles. Nonce-based style support is
deferred.

This feature adds a second host Adapter at the seam currently occupied only by
Vite. It does not add a second inspector. Selection, browser CSS inspection,
value semantics, managed stylesheet projection, change history, persistence,
and prompt generation remain shared.

## User workflow

1. A user or coding agent creates `index.html`, CSS, JavaScript, and assets.
2. The user runs `design-tool serve <root>`.
3. The standalone server serves the prototype on localhost and instruments HTML
   responses with source identity.
4. The standalone client configures and mounts the shared inspector.
5. The user previews CSS, token, and eligible rendered-text changes.
6. The user copies a prompt that names project-relative HTML/CSS source and
   includes an exact or best-effort selector fallback.
7. The coding agent updates source files; the standalone server reloads the
   page and refreshes token knowledge.

## Architectural outcome

```text
Vite Adapter ───────────┐
                       ├─ runtime host configuration ─ inspector runtime
Standalone host Adapter ┘

Standalone host Adapter
  ├─ static file server
  ├─ HTML response instrumentation
  ├─ token-inventory artifact discovery
  ├─ runtime manifest transport
  ├─ standalone client asset
  └─ source watch and browser reload
```

The runtime host configuration is the external seam. It contains the browser
knowledge that currently arrives through Vite virtual modules:

```ts
interface DesignToolRuntimeConfig {
  projectId: string;
  host: "vite-react" | "static-html";
  framework: "React" | "HTML";
  stylingSystem: string;
  capabilities: {
    canvas: boolean;
    componentSemantics: boolean;
  };
  tokenCatalog: TokenDefinition[];
  tokens: TokenEntry[];
  tokenDiagnostics: TokenCatalogDiagnostic[];
  tokenGeneration: string;
  componentContracts: ComponentContract[];
}
```

The exact internal storage is not part of the Interface. Callers configure one
runtime before bootstrap; inspector Modules read one immutable snapshot for the
active document. A host may atomically replace that complete snapshot when its
development transport refreshes, including Vite HMR. Standalone source changes
replace the document through reload rather than mutating configuration
piecemeal.

## Identity policy

For static source, the server uses a source-location-aware HTML parser and
source-preserving insertions:

```html
<button data-cid="html:button" data-src="index.html:12:5">Save</button>
```

Rules:

- Instrument selectable elements under `body`.
- Do not instrument `html`, `head`, `body`, `script`, `style`, `template`,
  `noscript`, or the Design Tool mount.
- Preserve author-supplied `data-cid` and `data-src` independently.
- Derive locations from the unmodified source response.
- Use project-relative paths and exact line and column values.
- Never persist injected identity to source files.
- Keep the exact `data-src` column in HTML selector fallbacks because compact
  HTML commonly contains multiple same-tag elements on one line.

Runtime-created DOM has no trustworthy source location. A document observer may
assign generated, document-local `data-*` identity so the element remains
selectable and managed CSS can target it. Prompts must label the source as
unknown and include bounded rendered evidence and a selector fallback.

## Capability contract

Standalone HTML supports:

- selection, hierarchy, overlays, and measurements;
- browser CSS attribution and raw-value controls;
- ordinary CSS custom-property token inventory and token replacement;
- managed stylesheet previews, change history, undo, redo, and revert;
- conservative rendered-text editing where durable identity is unique; and
- HTML-aware prompt output.

Standalone HTML does not initially support:

- semantic component-prop controls;
- direct mutation of application-owned HTML attributes;
- source write-back;
- Canvas mode;
- compiler-specific CSS that requires a separate styling Adapter; or
- arbitrary server-side rendering and application servers.

## Delivery stages

Each stage is independently committed and leaves existing Vite consumers
releasable.

### Stage 0 — Scope and plan

Add ADR-0009, this feature plan, and the narrow product-scope update. Preserve
the distinction between a static host Adapter and deferred build-tool Adapters.

**Exit conditions:**

- Product scope explicitly includes standalone static HTML.
- Canvas and source write-back remain out of scope.
- Later stages have testable outcomes and explicit dependencies.

### Stage 1 — Host-neutral runtime configuration

Introduce the runtime configuration Interface in the inspector and remove
runtime imports of Vite virtual-module values from shared Modules. Type-only
imports may remain where they do not create browser dependencies.

Update the Vite inspector bootstrap module to configure the runtime from
`virtual:design-tokens` and `virtual:design-tool-components` before mounting.
Keep Vite behavior and HMR semantics unchanged.

The standalone configuration uses empty component contracts and identifies the
framework as HTML. React runtime inspection remains registered only where the
host enables it.

**Exit conditions:**

- The inspector can bootstrap from an explicit runtime configuration.
- Existing Vite tests prove configuration is populated from virtual modules.
- No shared runtime Module requires a Vite virtual value at import time.
- Existing Vite unit tests, typecheck, and production build pass.

### Stage 2 — Static HTML identity Module

Add a Node-only HTML identity Module that accepts source text, project-relative
file identity, and instrumentation options, and returns transformed HTML plus
diagnostics. Keep parsing and source-preserving insertion inside the Module.

Use generated `html:<tag>` labels and exact `file:line:column` source identity.
Return the original source unchanged when no eligible elements exist.

**Exit conditions:**

- Unit tests cover normal, compact, malformed, and multi-page HTML.
- Tests cover exclusions, pre-existing attributes, escaping, and exact source
  locations.
- The Module has no server, filesystem, browser, or Vite dependency.

### Stage 3 — Standalone tracer bullet

Add a standalone workspace package with:

- a localhost static file server rooted at an explicit directory;
- safe URL-to-file resolution and content types;
- HTML response instrumentation;
- injected Design Tool mount, manifest URL, client URL, and reload client;
- a prebundled standalone inspector entry that owns React and React DOM; and
- a `design-tool serve [directory]` command.

The client loads one manifest, configures the inspector, and mounts the shared
runtime. The server binds to loopback by default and never writes served source.

**Exit conditions:**

- A plain directory with no package manifest or dependencies opens in a
  browser with Design Tool mounted.
- A static element can be selected and receives exact source identity.
- A raw CSS preview and HTML-aware prompt complete the end-to-end loop.
- The source file remains byte-for-byte unchanged.

### Stage 4 — Ordinary CSS token lifecycle and reload

Feed project CSS artifacts into `@design-tool/css/token-inventory`. Publish the
snapshot through the standalone manifest with project-relative provenance and
deterministic generation. Do not claim browser cascade order from directory
scan order.

Watch HTML, CSS, JavaScript, and asset files. Reload connected pages after a
settled change. Rebuild token knowledge before notifying clients about CSS
changes so the reloaded document receives one coherent manifest.

**Exit conditions:**

- CSS custom-property tokens appear with source provenance.
- Editing CSS updates token generation and reloads the page once.
- Add, change, and remove transitions are covered by unit tests.
- Unreadable or malformed CSS produces diagnostics without disabling raw CSS
  inspection.

### Stage 5 — HTML prompt and runtime-DOM hardening

Make framework and styling hints host-configured rather than React defaults.
Preserve exact static HTML identity in selector fallbacks. Add generated
identity for runtime-created elements without inventing source locations.

Hide unavailable framework semantics and Canvas entry points in standalone
mode. Ensure session persistence is namespaced by standalone project identity.

**Exit conditions:**

- Prompts identify `HTML + CSS` and include exact source or explicit unknown
  source evidence.
- Runtime-created elements remain selectable after DOM replacement.
- Component-prop and Canvas controls are absent in standalone mode.
- Existing React/Vite prompts and capabilities remain unchanged.

### Stage 6 — Consumer verification and release hardening

Add a plain HTML/CSS/JavaScript consumer fixture driven by Playwright. It must
exercise static selection, runtime-created selection, raw CSS preview, token
preview, rendered-text fallback, prompt copy, agent-style file change/reload,
and source preservation.

Run the repository verification obligations after focused standalone checks.

**Exit conditions:**

- Standalone unit and Playwright suites pass.
- `pnpm lint`, `pnpm typecheck`, and relevant package unit tests pass.
- `pnpm --filter sandbox build` still contains no Design Tool identity or
  runtime contract.
- Existing sandbox end-to-end coverage remains green for changed behavior.

## Verification strategy

### Interface tests

- Runtime configuration validates required fields and supplies safe defaults.
- Vite and standalone bootstrap paths produce equivalent token knowledge.
- Browser CSS inspection consumes configuration without knowing its transport.

### HTML instrumentation tests

- Exact file, line, and column identity.
- Same-line duplicate tags remain distinct.
- Existing identity is preserved.
- Unsafe/non-rendered elements are excluded.
- Source text is unchanged outside inserted attributes.

### Standalone server tests

- Root confinement and path traversal rejection.
- Correct MIME types and HTML-only transformation.
- Reserved runtime routes cannot collide with project files.
- Manifest generation and token diagnostics.
- Watch events coalesce into one reload revision.

### Browser tests

- Self-contained client mounts without host React.
- Static and runtime-created elements can be selected.
- Managed rules never become tracked-element inline styles.
- Prompt source and selector evidence are honest.
- Agent-authored file changes reload and refresh selection/token knowledge.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Runtime configuration becomes mutable global policy | Replace only complete immutable snapshots; notify consumers after atomic host refreshes. |
| Standalone client accidentally depends on host React | Bundle and test the client against a dependency-free fixture. |
| A strict CSP blocks inspector or managed-preview styles | Keep scripts external, document the current `style-src` requirement, and defer nonce support explicitly. |
| HTML serialization changes prototype markup | Use source locations and insertion edits; never reserialize the document. |
| Dynamic DOM receives false source precision | Use generated identity and explicit unknown-source prompt evidence. |
| Directory token order is mistaken for cascade order | Treat scan order as inventory evidence; browser inspection remains authoritative. |
| Server exposes files outside the prototype root | Canonicalize every request path and reject paths outside the configured root. |
| Existing Vite behavior regresses during decoupling | Characterize the virtual bootstrap and run Vite production stripping every stage. |

## Deferred work

- Webpack, Rollup, esbuild, Next.js, and framework build-tool Adapters.
- Serving an existing application server through proxy middleware.
- HTML attribute and behavior projection.
- Direct source write-back or MCP agent application.
- Standalone Canvas controller/renderer support.
- Compiler-specific CSS without an existing styling Adapter.
