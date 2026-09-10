# Packed consumer smoke tests

This suite verifies the publication and installation seam that workspace-linked
examples do not exercise. It builds the publishable packages, packs their exact
tarballs, exposes the scoped packages through a temporary local registry, and
installs each Adapter with the published `create-nudge-ui` executable in a clean
npm project.

Each smoke test starts the installed development server in Chromium and passes
only after `#nudge-ui-root` has a shadow root and the `window.__nudgeUi` bridge is
available. The fixture projects are copied to a temporary directory, so their
installer changes, lockfiles, dependency trees, and Vite caches never affect the
workspace examples.

Run all Adapter fixtures:

```sh
pnpm --filter packed-consumers test:e2e
```

Run one or more fixtures while iterating:

```sh
pnpm --filter packed-consumers test:e2e -- vite-react standalone
```

The Astro 5 and Vite 6 fixture currently records the known
`virtual:design-tokens` dependency-optimization failure as `XFAIL`. The
allowance is limited to that module-resolution error; installer, package,
server, or unrelated mount failures still fail the suite. Remove
`expectedMountFailure` from the Astro fixture after the shared client work
lands.
