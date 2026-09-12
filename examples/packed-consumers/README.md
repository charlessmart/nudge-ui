# Packed consumer smoke tests

This suite verifies the publication and installation seam that workspace-linked
examples do not exercise. It builds the publishable packages, packs their exact
tarballs, exposes the scoped packages through a temporary local registry, and
installs each Adapter with the published `create-nudge-ui` executable in a clean
npm project.

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

Astro 5 is intentional because `@nudge-ui/astro` supports Astro 5 and this stack
reproduces the external-consumer regression that the suite must retain. The
fixture currently records the known
`virtual:design-tokens` dependency-optimization failure as `XFAIL`. The
allowance is limited to the exact server-side module-resolution error;
installer, package, browser, and unrelated mount failures still fail the suite.
CI reports the expected failure as a warning and also warns if it unexpectedly
passes. Remove
`expectedMountFailure` from the Astro fixture after the shared client work
lands.

The `nextjs-16.1` fixture keeps the earliest supported Next.js 16 minor in the
packed development path. It intentionally imports a regular application CSS
file so the test also proves that removing Nudge UI's obsolete CSS query rule
does not affect the host application's stylesheet pipeline.
