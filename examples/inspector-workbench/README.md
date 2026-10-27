# Inspector workbench

Render the real Nudge inspector components as application content, then use Nudge
to inspect and preview changes to those components. The workbench is development-only.

## Run

From the repository root, using Node.js 22.12 or newer:

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm dev:workbench
```

Open <http://localhost:5186/?nudge-ui=on>. Nudge opens the workbench in its canvas.
For the fixture by itself, open <http://localhost:5186/?nudge-ui=off>.

1. Choose **Use app normally** in the outer Nudge toolbar to switch scenarios or
   operate fixture controls. Holding **A** temporarily enables app interaction.
2. Choose **Select** to inspect a control inside the fixture panel.
3. Adjust its styles in the outer inspector.
4. Use the outer inspector's **Copy prompt** action to export the design change.
   Source identities point to the shared files in `packages/nudge-ui/src/inspector`.
5. Apply the prompt to those files. Vite hot-updates the fixture from source.

The outer inspector uses the built client. Rebuild packages and reload to update
that client after changing inspector source.

## Scenarios

`src/scenarios.ts` defines serializable initial states: typography, flex, grid,
linked elements, unlinked elements, component examples, desktop-first and mobile-first media queries, mixed selection, pending changes, empty,
inspection error, and controlled fields. Use `?scenario=linked` to open one directly.
**Reset fixture** restores the current scenario without clearing outer Nudge edits.

`InspectorPanel`, `InspectorSelection`, and `PromptActionButton` accept state and
callbacks. Production uses the same components. The controlled-fields scenario
uses production `TokenValueField` controls with local values and callbacks.

`InspectorEditors` composes the existing production editors. These still require
DOM elements for computed styles, so `FixtureTargets.tsx` supplies offscreen sample
content and the workbench resolves it through browser CSS inspection. This is an
incremental presentation boundary, not a fully JSON-driven replacement for every
editor. Component-prop and agent workflows are outside this first set of
fixtures.

The **Canvas toolbar** scenario renders the real floating `CanvasToolbar` with each
tool active, and the real sketch bar (`SketchToolBar`, the presentational half of
`SketchToolBar`) in every state on one page: each drawing tool, other colours,
the colour palette open, nothing drawn, and taking a screenshot. Each bar holds
its own state, so you can change its tool or colour, but nothing is drawn,
captured or sent. The fixture's agent status is a snapshot and its prompt action displays
local feedback; neither sends to an agent nor writes to the clipboard.

## Isolation and styling

The fixture imports workspace source, while the normal injected Nudge client stays
bundled. Keep those module graphs separate: aliasing the editing client to source
would share fixture and editor singletons in the preview document.

The example's Vite adapter routes fixture portals into `.workbench-preview` and
replaces the fixture draft preview with a style-only adapter. It uses the production
projection compiler with a separate stylesheet so fixture resets cannot overwrite
outer Nudge edits. Fixture persistence uses an in-memory store.

The adapter reads the production `ui/styles.ts` manifest and imports its CSS files
as regular Vite stylesheets for source attribution and hot updates. It maps `:host`
to the fixture surface. `workbench.css` supplies the page layout and embedded panel
positioning. Production retains its normal shadow-root mount and portals.

Production builds contain only an instruction to run the development server.

## Verify

```sh
pnpm --filter inspector-workbench typecheck
pnpm --filter inspector-workbench test:e2e
pnpm --filter inspector-workbench build
```

Browser tests cover fixture reset, token menus, seeded changes, and selecting a real
panel control with Nudge, previewing an edit, and copying its source-aware prompt.
