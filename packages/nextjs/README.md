# `@nudge-ui/nextjs`

`@nudge-ui/nextjs` integrates Nudge UI with the Next.js development server. It
adds dev-only source identity, inspector mounting, and the local manifest
transport for the App Router.

## Install

```sh
pnpm add -D @nudge-ui/nextjs
```

The package supports Next.js 15.3 through 16.x and React 18 or 19.

## Configure Next.js

Wrap the existing configuration in `next.config.ts`:

```ts
import { withNudgeUi } from "@nudge-ui/nextjs";

const nextConfig = {};

export default withNudgeUi(nextConfig);
```

The wrapper preserves the application's configuration and instruments only
the Next.js development server. `next build` and production runtime paths do
not receive Nudge UI bootstrap or identity transforms.

## Additional exports

The package exports the manifest helpers, mount helper, sidecar lifecycle, and
loader utilities for custom Next.js host integrations. Most applications need
only `withNudgeUi`.
