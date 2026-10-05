# Nudge UI

Edit the look of your running app in the browser, then hand the changes to your
coding agent. Nudge UI is a development-only visual inspector for Next.js,
Astro, Vite with React, and static HTML.

Select an element, adjust its design, and see the result immediately. Copy a
structured prompt or send it to a connected agent to apply the changes to your
source code. Nudge previews app edits; your coding agent implements them.

![Nudge UI visual inspector](https://github.com/user-attachments/assets/2f8abf6d-71cc-4823-8042-25a6e6407d74)

## Get started

Run this from your application's root directory:

```sh
npm create nudge-ui@latest
```

The initializer installs `nudge-ui`, configures your framework, and offers to
connect a coding agent. Start your app with its usual development command and
open the local URL to use the editor.

Requires Node.js 20 or later. Your framework or build tool may require a newer
version. Supported host versions are Vite 5+, Next.js 15.3–16.x, and Astro 5+;
React integrations support React 18 and 19. Framework peer dependencies are
optional, so you only need the tools your app uses.

## What you can do

- **Inspect and edit:** Preview layout, spacing, typography, colors, backgrounds,
  borders, shadows, text, design tokens, and supported component props.
- **Compare pages:** Open routes in Canvas frames, resize them, and create linked
  duplicates to compare the same design at different viewport sizes.
- **Explore alternatives:** Create independent HTML iterations from a frame,
  refine them, and ask an agent to implement your chosen design in the live app.
- **Explain changes:** Add comments and sketches alongside visual edits.
- **Hand off to an agent:** Copy a prompt with source context, or send it through
  the optional MCP integration and see the agent's status in the editor.

## Use the editor

| Tool | Shortcut | Action |
| --- | --- | --- |
| Select | `V` | Select elements to inspect and edit. |
| Comment | `C` | Attach a note to an element. |
| Pencil | `P` | Draw on the page and add sketch notes. |
| Use app normally | Hold `A` in Canvas | Interact with the app. You can also select this tool in the toolbar. |

Hold `Space` to pan the canvas. Use undo and redo to revisit edits and frame
changes. Comments and pending edits are saved locally.

Use **Duplicate** for a linked live frame or **Iteration** for an independent
HTML design. Iterations save HTML and CSS under `.nudge/artifacts/` in your
project. They capture the rendered design without the app's scripts. Iteration
prompts ask the agent to edit that HTML; **Copy prompt for live app** asks it to
implement the design in application source.

After handoff, comments clear when Nudge detects that the target's content or
appearance changed at the same viewport size, with previews removed. This
detects a change; it does not verify that the note was satisfied. Missing or
ambiguous targets keep their comments.

## Connect a coding agent

To add or repair agent integration in an installed project, run:

```sh
npx nudge-ui agent setup
```

Setup installs [`@nudge-ui/mcp`](https://www.npmjs.com/package/@nudge-ui/mcp)
and configures your selected agent. Fully restart the agent host, ask it to
**listen to Nudge in this workspace**, and keep it listening while you send
changes. You can use copied prompts without MCP.

The MCP integration is early alpha. For diagnostics, run
`npx nudge-ui agent doctor` from the app directory. See the
[coding-agent guide](https://github.com/charlessmart/nudge-ui/blob/main/docs/agent-integration.md)
for host limitations and session selection.

## Manual installation

Install the package as a development dependency:

```sh
npm install --save-dev nudge-ui
```

Choose the integration for your host. There is no root `nudge-ui` import.

### Vite with React

Wrap your existing `vite.config.ts` configuration:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { withNudgeUi } from "nudge-ui/vite";

export default withNudgeUi(defineConfig({
  plugins: [react()],
}));
```

For authored workspace packages outside the app root, pass their directories
with `sourceRoots`, for example `withNudgeUi(config, { sourceRoots: ["../../packages/ui"] })`.
Dependency and generated-output directories remain excluded. Vite and Astro
also accept `debug: true` for experimental DOM parent and child navigation.

### Next.js

Wrap your `next.config.ts` configuration:

```ts
import { withNudgeUi } from "nudge-ui/next";

const nextConfig = {};

export default withNudgeUi(nextConfig);
```

The integration supports Webpack and Turbopack. Use `sourceRoots` for authored
workspace directories outside the application root.

### Astro

Add the integration to `astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import { nudgeUiAstro } from "nudge-ui/astro";

export default defineConfig({
  integrations: [nudgeUiAstro()],
});
```

`withNudgeUi(defineConfig(...))` from `nudge-ui/astro` is also supported and is
the form used by the initializer.

### Static HTML

Serve a directory of HTML, CSS, and assets:

```sh
npx nudge-ui serve ./prototype
```

The server binds to loopback, instruments HTML in memory, and reloads after file
changes. Dot-prefixed files and directories, including `.env`, are not served.

## Development and automated tests

Nudge is enabled by default in development. Standard production builds exclude
the inspector bootstrap, identity attributes, and token data.

- **Disable for one tab:** Add `?nudge-ui=off`. The setting persists as you
  navigate in that tab. Add `?nudge-ui=on` to enable it again.
- **Disable for one server run:** Start the server with `NUDGE_UI=0`, for example
  `NUDGE_UI=0 npm run dev`.
- **Disable in framework configuration:** Pass `enabled: false`, for example
  `withNudgeUi(config, { enabled: false })` or `nudgeUiAstro({ enabled: false })`.

Automated browsers with `navigator.webdriver` enabled get the plain app by
default. To test the editor, add `?nudge-ui=on` to the first URL or start the
development server with `NUDGE_UI=1`.

## Package entry points

Use `nudge-ui/vite`, `nudge-ui/next`, `nudge-ui/astro`, or `nudge-ui/static` for
host integration. `nudge-ui/testing` provides consumer test fixtures, and
`nudge-ui/virtual-design-tokens` provides ambient types for the token transport
module. Imports under `nudge-ui/internal/*` are implementation details and may
change without notice.

## Links

[Initializer](https://www.npmjs.com/package/create-nudge-ui) ·
[MCP integration](https://www.npmjs.com/package/@nudge-ui/mcp) ·
[Repository](https://github.com/charlessmart/nudge-ui) ·
[Issues](https://github.com/charlessmart/nudge-ui/issues) ·
[MIT license](https://github.com/charlessmart/nudge-ui/blob/main/LICENSE)
