# ADR-0050: Component framework adapters, and component sheets on Next.js

Date: 2026-11-08
Status: Accepted
Supersedes: ADR-0045's and ADR-0046's statements that only the Vite host with the React adapter serves component
sheets and library routes, and ADR-0034's consequence that the Next.js host identifies tagged callsites but does not
inject the renderer capture

## Context

ADR-0007 said Vue, Svelte and other frameworks need their own source and runtime Adapters rather than conditionals in
the Inspector. The runtime half has that shape (`ComponentRuntimeAdapter`). The host half did not. The Vite host's
`react.ts` mixed four concerns in one closure: React's syntax (identity, policy, contracts), the contract catalog
(per-file syntax, package types, the TypeScript checker pass), Vite configuration, and the sheet entry. The Next.js
host repeated part of it with less: syntactic contracts only, no renderer capture, no sheets.

Adding a framework or a bundler therefore meant copying that closure. Two products of the gap were visible on Next.js
today: props behind imported types had no controls, and live prop preview worked only with the React DevTools
extension installed.

## Decision

### A framework is one `ComponentFrameworkAdapter`

`hosts/componentFramework/adapter.ts` defines what a host needs from a UI framework, and nothing about a bundler:

- syntax: `instrument`, `resolvePolicy`, `extractFileContracts`, `collectPackageImports`, `extractPackageContracts`,
  and an optional `createTypeAwareRunner` for a checker pass off the main thread;
- the browser: `runtimeModules.components`, `runtimeModules.sheet` (null when the framework has no sheet renderer),
  `documentHeadScript`, `singletonPackages` and `singletonSpecifiers`;
- conventions: `sourceFile`, `sheetWrapperFiles`, `defaultProtocols`, and `isServerOnlyModule` for sheets that cannot
  import a module in the browser.

`reactComponentFramework` is the only Adapter. `COMPONENT_FRAMEWORKS` stays `["react"]`: a framework joins it with its
Adapter, never ahead of one. Inspector validators ask `isComponentFramework` rather than comparing with `"react"`.

### The contract catalog is shared by every host

`createComponentCatalog(adapter, host, options)` owns per-file contracts, package contracts fingerprinted on what the
project renders, the checker pass, hand-written `componentMetadata`, wrapper roles, and `warmUp`/`rescan`/`observe`/
`forget`. A host supplies only `root`, `isHostSource`, `catalogPath` and `warn`. Vite's `framework.ts` is now glue:
aliases from the Adapter's runtime modules, `dedupe` from its singleton packages, the transform hook and the contracts
virtual module. Sheet wrapper discovery and the sheet definition (`contracts`, `loaders`, `sheetWrapper`) live in
`componentFramework/sheet.ts`; hosts choose module specifiers.

### Next.js uses the catalog and captures React's renderer

The sidecar's contracts come from the catalog, so Next.js gains package-type and checker contracts with the same
`typeAwareComponents` and `componentMetadata` options as Vite. A loader posting rereads the file through the catalog;
a posting for a file the sidecar cannot read is kept as posted.

The root layout transform renders `NudgeUiHead`, the renderer capture script, as the first child of `<head>`, adding a
`<head>` when the layout has none. Next's own scripts are `async`, so the capture runs before React DOM evaluates.

### Next.js component sheets are a self-ignoring stub route

Next routes only files under `app/` (or `pages/`). In `next dev`, and only when an App Router root layout exists, the
wrapper writes:

- `app/%5F%5Fnudge_ui%5F%5F/components/page.nudge.tsx`, a client page without JSX that imports
  `nudge-ui/internal/next/component-sheet` and the generated definition. `%5F` keeps the route at
  `/__nudge_ui__/components` instead of a private folder;
- `app/%5F%5Fnudge_ui%5F%5F/.gitignore` containing `*`, so the folder never appears in git;
- `.nudge/next/component-sheet.ts`, which the sidecar rewrites when contracts change.

The wrapper adds `nudge.tsx` to `pageExtensions` in development only. A production build reads `page.nudge.tsx` as a
`page.nudge` file with extension `tsx`, which is not a route, and the wrapper deletes the stub folder when it evaluates
the production-build phase, so neither the build nor its type check sees it. The proxy rewrite excludes the components
path, so the sheet is a Next page while every other reserved route stays with the sidecar, which now also serves
library visibility.

The sheet renders inside the application's root layout, keeping its global CSS, fonts and body classes. It mounts its
own React root under `<body>` and hides the layout's other body children. Because an unresolvable `import()` fails the
whole module's compile on Turbopack and webpack, unlike Vite, the definition lists only modules a browser can load:
project files that exist and are not route files or server-only, and packages present in `node_modules`.

## Consequences

- A new framework is an Adapter plus its runtime Adapter. A new bundler host reuses the catalog and the sheet
  definition and writes only its glue.
- Next.js projects get checker contracts, live prop preview without the DevTools extension, and component sheets.
- Pages Router projects, and App Router projects whose root layouts live in route groups, get no sheets; the wrapper
  says so once.
- Nudge writes into `app/` during development. The folder ignores itself and is removed by a production build. A user
  who deletes it gets it back on the next `next dev`.
- Server components without `"use client"` load into the sheet as client modules. Their host elements carry identity,
  but their callsites are not registered, because the loader instruments components only in client modules.
- A server-only module that the Adapter cannot recognise by an import, export or directive breaks the definition's
  compile, so every sheet shows Next's error overlay until the module says it is server-only. Hiding the component in
  the library does not remove it from the definition.

## Verification

- `componentFramework` unit tests cover the catalog's scan, rescan pruning and metadata precedence, wrapper discovery
  and the sheet definition.
- Next.js unit tests cover the stub route, the definition's filtering, the head capture in both layout shapes, the
  development-only page extension, the rewrite exclusion, the production-build cleanup and checker contracts in the
  sidecar.
- In `examples/sandbox-next`, `/__nudge_ui__/components?component=…` renders a sheet in `next dev`, and the hook
  holds React's renderers on page load.
