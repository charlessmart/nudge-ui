# `@nudge-ui/astro`

`@nudge-ui/astro` integrates the Nudge UI development inspector with Astro.
It instruments development HTML responses, connects the shared Vite adapter,
and mounts the inspector on rendered pages, including pages with React
islands.

## Install

```sh
pnpm add -D @nudge-ui/astro
```

Astro 5 or newer and Vite 5 or newer are supported.

## Configure Astro

Register the integration in `astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import { withNudgeUi } from "@nudge-ui/astro";

export default withNudgeUi(defineConfig({}));
```

The integration is active only for `astro dev`. Production builds do not
receive Nudge UI bootstrap, identity attributes, or token data. The wrapper
preserves existing integration lists regardless of whether they are inline,
stored in a variable, or assembled with spreads. Pass shared Vite options,
such as `debug`, as the second argument to `withNudgeUi(config, options)`.
