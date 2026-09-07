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

## Configure Vite

Add Nudge UI after the React plugin in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nudgeUi } from "@nudge-ui/vite-react";

export default defineConfig({
  plugins: [react(), ...nudgeUi()],
});
```

Pass `debug: true` to enable experimental inspector navigation features:

```ts
plugins: [react(), ...nudgeUi({ debug: true })]
```

The adapter exposes optional `tokens`, `identity`, `component-contracts`, and
`vanilla-extract-runtime` subpaths for host integrations. Application projects
normally need only the root `nudgeUi` export.
