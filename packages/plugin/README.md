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

Semantic previews fail closed for unknown package components because a package
export may inspect its JSX children or treat prop values as opaque data. For a
leaf component with no rendered JSX slots, use the compatibility shorthand:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), {
  compatibleComponentImports: {
    "@acme/design-system": ["Button", "Card"],
  },
});
```

For a structural library, declare its complete protocol instead. `wrap`
controls whether Nudge may replace the component callsite with its semantic
boundary. A `rendered` slot allows the compiler to continue safely into JSX
received by that slot:

```ts
export default withNudgeUi(defineConfig({
  plugins: [react()],
}), {
  componentProtocols: {
    "@acme/layout": {
      exports: {
        Provider: { wrap: false, slots: { children: "rendered" } },
        Item: { wrap: false, slots: { content: "rendered" } },
      },
    },
  },
});
```

The host Adapter resolves aliases, workspace packages, project barrels, and
factory or tagged-template definitions before applying these protocols.
Project-owned definitions are wrapped and their authored `children` are
traversed by default; a named JSX prop stays opaque until a protocol declares
that slot as `rendered`. Unknown package subtrees stay unchanged and emit a
build diagnostic. React Router support is provided by the default compatibility
catalog and uses the same mechanism as any other structural library.

Source identity is project-root relative. A file in a declared `sourceRoots`
package records a `../`-prefixed path, so it stays unique against the
application's own files and never serialises a machine path into a prompt or a
DOM attribute.

The adapter exposes an optional `tokens` subpath for host integrations.
Application projects normally need only the root `withNudgeUi` export.

This adapter gathers evidence; it does not interpret it. Identity injection and
component-contract extraction are host-neutral compilers in
`@nudge-ui/compiler`, and Tailwind and vanilla-extract interpretation lives in
`@nudge-ui/css/dialects`, where the browser runtime reads the same grammar.
