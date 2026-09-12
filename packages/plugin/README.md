# `@nudge-ui/vite-react`

`@nudge-ui/vite-react` is the Nudge UI adapter for Vite projects that use
React. It adds development-only rendered identity, token discovery, component
contract discovery, and inspector bootstrap.

## Install

```sh
pnpm add -D @nudge-ui/vite-react
```

The adapter supports Vite 5 or newer and React projects. It is intentionally
React-specific; use a framework adapter for Next.js or Astro, or a different
adapter when one becomes available for another UI runtime.

In development, the adapter serves Nudge UI's self-contained client and a
plain-data manifest from `/__nudge_ui__/`. The inspector UI does not enter the
application's Vite dependency graph and the adapter does not alias the
application's React packages. Only the small React component Adapter compiles
with the host application.

## Configure Vite

Wrap the Vite configuration export in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { withNudgeUi } from "@nudge-ui/vite-react";

export default withNudgeUi(defineConfig({
  plugins: [react()],
}));
```

`withNudgeUi` also accepts callback and promise-based Vite configuration
exports. It preserves the host configuration and appends the Adapter after
the existing plugins. The lower-level `nudgeUi()` export remains available
for host integrations that need to compose individual plugin arrays.

Pass `debug: true` to enable experimental inspector navigation features:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), { debug: true });
```

For a monorepo, list authored workspace packages that live outside Vite's
resolved root. The adapter uses these directories for identity, component
contracts, and stylesheet provenance; dependencies and generated directories
remain excluded:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), {
  sourceRoots: ["../../packages/ui"],
});
```

Semantic previews fail closed for package components because a package export
may treat `children` or prop values as opaque data. Opt a known-compatible
package export into callsite instrumentation explicitly:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), {
  compatibleComponentImports: {
    "@acme/design-system": ["Button", "Card"],
  },
});
```

Local relative component imports remain eligible automatically. React and
React Router structural exports are always preserved, even when metadata lists
them.

The adapter exposes optional `tokens`, `identity`, `component-contracts`, and
`vanilla-extract-runtime` subpaths for host integrations. Application projects
normally need only the root `nudgeUi` export.
