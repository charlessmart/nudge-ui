# Packed consumer smoke tests

This suite verifies the publication and installation seam that workspace-linked
examples do not exercise. It builds the publishable packages, packs their exact
tarballs, exposes the scoped packages through a temporary local registry, and
installs each Adapter with the published `create-nudge-ui` executable in a clean
npm or pnpm project.

Each smoke test starts the installed development server in Chromium and passes
only after `#nudge-ui-root` has a shadow root and `window.__nudgeUi.version` is
`1`. Browser assertions live in `tests/` and use the repository's standard
Playwright configuration. The fixture projects are copied to a temporary
directory, so their installer changes, lockfiles, dependency trees, and Vite
caches never affect the workspace examples.

Run all Adapter fixtures:

```sh
pnpm --filter packed-consumers test:e2e
```

Run one or more fixtures while iterating:

```sh
pnpm --filter packed-consumers test:e2e -- vite-react standalone
```

The packed matrix covers Vite 6 with React 18, Vite 8 with React 19 and a
declarative React Router tree, Next.js 16.1 and 16.3, Astro 5, npm and pnpm,
and flat and workspace-monorepo layouts. The current Vite fixtures use
callback-form configuration exports, and the workspace fixture declares the
copied `packages/ui` directory through `sourceRoots`.

Every entry must mount the Nudge bridge. The two Vite React 19 fixtures also
declare `expectedApplicationText`, so for those a mounted inspector cannot hide
a host render failure; the remaining entries assert the bridge alone.

Astro 5 is intentional because `@nudge-ui/astro` supports Astro 5 and this stack
reproduces the external-consumer regression that the suite must retain: a
`virtual:design-tokens` dependency-optimization failure during server-side
module resolution. The shared client work fixed that regression, so the Astro
entry is a required PASS. The suite keeps it, unsuppressed, as a permanent guard
against the regression returning.

The `nextjs-16.1` fixture keeps the earliest supported Next.js 16 minor in the
packed development path. It intentionally imports a regular application CSS
file so the test also proves that removing Nudge UI's obsolete CSS query rule
does not affect the host application's stylesheet pipeline.
