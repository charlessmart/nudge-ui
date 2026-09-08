# `@nudge-ui/css`

`@nudge-ui/css` provides the shared CSS and design-token model used by Nudge
UI. It includes browser-safe value semantics, token references, resolved CSS
facts, attribution evidence, and build-time token inventory contracts.

## Install

```sh
pnpm add @nudge-ui/css
```

Host integrations normally install this package transitively. Install it
directly when a tool needs to read or model the same CSS and token contracts as
the inspector.

## Browser-safe imports

The root entry point and these subpaths are safe to use in browser bundles:

```ts
import type { TokenEntry, TokenTable } from "@nudge-ui/css";
import { interpretValue } from "@nudge-ui/css/value-semantics";
```

The `@nudge-ui/css/model` subpath exposes the shared data types. The
`@nudge-ui/css/value-semantics` subpath exposes value interpretation, token
selection, and meaning-preserving edits.

## Build-time token inventory

Use `@nudge-ui/css/token-inventory` from Node.js or a build tool to aggregate
ordered stylesheet artifacts and styling-system contributions:

```ts
import { createTokenInventory } from "@nudge-ui/css/token-inventory";
```

This subpath imports PostCSS and is intentionally not browser-safe. Keep it
out of client bundles.
