# Standalone CSS-library sandboxes

## Problem

`examples/sandbox` is a single Vite document. `src/main.tsx` imports
`./styles.css` (raw-CSS marketing resets + tokens) and `./tailwind.css`
(`@import "tailwindcss"`) globally, so every route loads both stylesheets:

1. Tailwind utilities resolve on the raw-CSS pages because `tailwind.css` is
   always loaded.
2. Unlayered `styles.css` resets (`*`, `body`, `a`, `button`) outrank Tailwind
   `@layer` utilities in the cascade, so raw-CSS resets bleed into the Tailwind
   pages.

Cascade layers can fix #2 but never #1. The only way Tailwind classes stop
resolving on the raw-CSS page is to stop loading Tailwind there. That requires
separate documents per CSS library.

We are in the pipeline-verification phase, so the strongest form of this is a
set of **standalone apps**, each a real Vite project importing `designTool()`
as a plugin and running the real CSS-library compiler — the same way a paying
consumer would. The main sandbox stays as the default raw-HTML/CSS demo.

The standalone apps are library-compatibility fixtures, not a claim of broad
frontend-framework or build-tool support. `PLAN.md` remains React-first and
Vite-first. CSS grammar breadth belongs primarily in fast conformance tests;
the apps prove that representative cases survive a real compiler, the Vite
stylesheet pipeline, the Inspector, managed preview, prompt generation, and
production stripping.

## Goal

- `examples/sandbox` — the default demo, raw HTML/CSS only (marketing page,
  conformance pages, component-props, perf fixture). No Tailwind or
  vanilla-extract compiler output anywhere in its CSS graph.
- Three standalone library consumers under `examples/`:
  - `sandbox-tailwind-v4` — real Tailwind v4 landing + v4 examples.
  - `sandbox-tailwind-v3` — real Tailwind v3 compilation + v3 examples.
  - `sandbox-sprinkles` — real vanilla-extract/Sprinkles compilation + examples,
    promoted from the existing `compat-vanilla-extract` consumer.
- Each app owns its compiler, CSS graph, adapter config, token catalog, routes,
  and compatibility specs.
- The same spacing, typography, color, border, and layout situations are
  represented in every app and checked through a shared, data-only corpus
  contract. App-specific CSS continues to come from that app's real authoring
  system.
- Isolation is an automated contract: each app proves both what is present and
  what must be absent from its CSS graph and token catalog.
- ADR-0002 is verified against every built app by assertions, not inferred from
  a successful `vite build`.

## Resolved product decisions

### No combined rendered showcase

Delete the mixed `ExamplesPage.tsx`. Rendering all four styling systems in one
document recreates the ambiguity this split removes.

If a single navigation entry remains useful, `/examples` may become a
lightweight hub containing ordinary links to the raw-CSS examples and the three
standalone apps. It must not import their stylesheets or render their specimens
together. The cross-origin standalone links are navigation links only and are
not eligible Canvas routes.

### Canvas route-discovery fixture

Canvas remains single-origin per PLAN.md and ADR-0006. The sandbox Canvas specs
must use a retained same-origin route rather than a standalone app on another
port.

Use `/conformance` as the replacement route for this change. Rename
Tailwind-specific test variables and assertions (`tailwindLink`, `hasTailwind`, and
similar) to describe generic second-route discovery. A dedicated lightweight
`/canvas-fixture` route may replace `/conformance` later if unrelated
conformance-page evolution makes the Canvas tests brittle.

## Directory layout

```text
examples/
  sandbox/                         # 5173 — raw CSS consumer
    src/main.tsx                   # raw-CSS routes only
    src/styles.css                 # raw theme + resets + component-props CSS
    src/ExamplesRawCssPage.tsx
    src/showroom.css               # neutral showroom chrome only
    src/App.tsx                    # same-origin Canvas CTA + external app links
    vite.config.ts                 # react() + designTool(); no library adapters
    tests/                         # full Inspector/Canvas UI suite + raw contract
    playwright.config.ts           # dev + prod projects

  sandbox-tailwind-v4/             # 5174 — new real consumer
    index.html
    vite.config.ts                 # react() + tailwindcss() + designTool()
    src/tailwind.css               # @import "tailwindcss"
    src/main.tsx                   # /tailwind + /examples
    src/TailwindLandingPage.tsx
    src/ExamplesTailwindV4Page.tsx
    src/showroom.css               # neutral chrome; no simulated utilities/tokens
    src/examples-shared.tsx
    src/compatibility-manifest.ts
    tests/compatibility.dev.spec.ts
    tests/tailwind-landing.dev.spec.ts
    tests/isolation.dev.spec.ts
    tests/design-tool.prod.spec.ts
    playwright.config.ts           # dev + prod; reduced cross-browser contract

  sandbox-tailwind-v3/             # 5175 — new real consumer
    index.html
    tailwind.config.ts             # one config object shared with designTool()
    postcss.config.*               # real Tailwind v3 PostCSS pipeline
    vite.config.ts                 # react() + designTool({ tailwindV3: ... })
    src/app.css                    # @tailwind base/components/utilities
    src/main.tsx                   # /tailwind-v3 + /examples
    src/TailwindV3ConformancePage.tsx
    src/ExamplesTailwindV3Page.tsx
    src/showroom.css
    src/examples-shared.tsx
    src/compatibility-manifest.ts
    tests/compatibility.dev.spec.ts
    tests/isolation.dev.spec.ts
    tests/design-tool.prod.spec.ts
    playwright.config.ts

  sandbox-sprinkles/               # 5176 — promote compat-vanilla-extract
    index.html
    vite.config.ts                 # vanillaExtractPlugin() + designTool(adapter)
    src/theme.css.ts               # real theme contract
    src/sprinkles.css.ts           # real createSprinkles() output
    src/main.tsx                   # /sprinkles + /examples
    src/SprinklesConformancePage.tsx
    src/ExamplesSprinklesPage.tsx
    src/showroom.css
    src/examples-shared.tsx
    src/compatibility-manifest.ts  # retains existing real-compile scenarios
    tests/compatibility.dev.spec.ts
    tests/isolation.dev.spec.ts
    tests/design-tool.prod.spec.ts
    playwright.config.ts
```

`pnpm-workspace.yaml` already covers `examples/*`. Promote/rename
`examples/compat-vanilla-extract` rather than retaining a second Sprinkles app
with overlapping responsibilities.

## Implementation steps

### 1. Scaffold two apps and promote the existing Sprinkles consumer

Model the new Tailwind apps on the standalone structure already used by
`examples/compat-vanilla-extract`: package scripts (`dev`, `build`, `typecheck`,
`test:e2e`), `index.html`, `tsconfig.json`, virtual-module declarations, and a
Playwright config with strict, unique dev and preview ports.

Promote `examples/compat-vanilla-extract` to `examples/sandbox-sprinkles`, keep
its existing real compiler scenarios, add the showroom routes, and change its
port from 5273 to 5176. Do not create a second hand-authored Sprinkles
simulation.

Ports:

- sandbox dev/preview: 5173/4173
- Tailwind v4 dev/preview: 5174/4174
- Tailwind v3 dev/preview: 5175/4175
- Sprinkles dev/preview: 5176/4176
- newvato remains 5189

Common dependencies are React, React DOM, the Design Tool workspace packages,
Vite, TypeScript, Playwright, and the React Vite plugin. Library-specific
dependencies are:

- Tailwind v4: `tailwindcss@4` and `@tailwindcss/vite`.
- Tailwind v3: `tailwindcss@3`, PostCSS, and the real v3 config/build path.
- Sprinkles: `@vanilla-extract/css`, `@vanilla-extract/sprinkles`, and
  `@vanilla-extract/vite-plugin`.

Use explicit major versions in each app so pnpm may install Tailwind v3 and v4
side by side without hoisting assumptions becoming part of the test.

### 2. Split showroom chrome from library output

The current `examples.css` is not safe to copy. It combines page chrome, raw
custom-property tokens, hand-authored Tailwind v3 simulation classes, and
hand-authored Sprinkles simulation classes.

Split it as follows:

- `showroom.css` contains only neutral page/card/specimen presentation. Use
  literal values for this chrome so it does not add unrelated design tokens to
  every app's catalog.
- Raw CSS token definitions and raw specimens remain in `sandbox`.
- Tailwind v4 specimen styling is generated by Tailwind v4.
- Tailwind v3 specimen styling is generated by Tailwind v3; delete the
  hand-authored `.bg-brand`, `.text-brand`, `.border-brand`, and related
  simulations.
- Sprinkles specimen styling is generated from `.css.ts`; delete the
  hand-authored `spr-*` and hashed-variable simulations.

Copies of neutral `showroom.css` and `examples-shared.tsx` are acceptable for
self-contained consumer apps. Framework output and token definitions must not
be shared or copied between apps.

Move each framework page into its owning app. Update `exId` source paths to the
app-relative page file so selector fallbacks remain grep-ready and stable.

### 3. Preserve one data-led corpus contract

Extend `@design-tool/compatibility` only as needed to describe the common
spacing, typography, color, border, and layout case IDs and expectations. This
shared contract contains data and Playwright helpers, never CSS or compiled
framework output.

Each app supplies its own compatibility manifest mapping those common
situations to real selectors and library-specific expectations. The manifest
runner verifies representative cases through the entire path:

1. authored CSS and browser-computed result;
2. build-time catalog entry, adapter, origin, and source provenance;
3. runtime token attribution and Inspector control type;
4. compatible token suggestions;
5. managed-stylesheet edit with no tracked-element inline-style mutation;
6. painted result, change log, generated prompt, and revert;
7. invariants such as CSS import order and React rerender stability.

Add a completeness assertion that every expected case ID is rendered in each
app. Not every case needs a full edit flow: run cheap inspection assertions for
the complete corpus and one representative edit/revert flow per capability and
library.

### 4. Configure one real compiler and adapter per app

- `sandbox/vite.config.ts` uses `designTool()` with no Tailwind or
  vanilla-extract options. Remove the Tailwind v4 Vite plugin and the global
  `tailwind.css` import.
- `sandbox-tailwind-v4` uses `react() + tailwindcss() + designTool()`.
  Tailwind v4 remains content-detected.
- `sandbox-tailwind-v3` runs the real Tailwind v3 PostCSS compiler. Its Tailwind
  compiler and `designTool({ tailwindV3: ... })` consume the same config object
  so the fixture cannot pass with two divergent definitions.
- `sandbox-sprinkles` keeps the real vanilla-extract Vite plugin and points the
  Design Tool adapter at the actual theme-contract module/export. Generated
  identifiers remain non-semantic (for example, short hashes) so successful
  attribution must come from the contract rather than class-name guessing.

Each app's catalog is thereby scoped to the stylesheet graph and adapter that
the real consumer loaded.

### 5. Trim sandbox routes and navigation

Remove from `sandbox/src/main.tsx`:

- `/tailwind`
- `/tailwind-v3`
- `/sprinkles`
- the mixed rendered `/examples`
- `/examples/tailwind-v4`
- `/examples/tailwind-v3`
- `/examples/sprinkles`

Keep `/`, `/conformance`, `/examples/raw-css`, the property conformance pages,
`/pipeline-conformance`, `/component-props`, and the large perf fixture.

Delete `ExamplesPage.tsx`. If `/examples` remains, implement only the link hub
described above. Retarget the header CTA to `/conformance` for same-origin
Canvas discovery. Conformance navigation may include normal external links to
the three standalone apps; tests must treat them as navigation, not Canvas
targets.

Keep `styles.css` and the `ui/` semantic-prop fixtures that belong to the raw
component-props page. Verify that none of the retained sandbox imports pull in
Tailwind or vanilla-extract output transitively.

### 6. Re-home and reshape browser specs

Move route-specific specs into their owning app:

| Existing coverage | Destination |
|---|---|
| Tailwind landing tests | `sandbox-tailwind-v4` |
| Tailwind `@supports` / at-rule test | `sandbox-tailwind-v4` manifest/spec |
| Tailwind token-picker test | `sandbox-tailwind-v4` manifest/spec |
| Tailwind v3 conformance | `sandbox-tailwind-v3` manifest/spec |
| Sprinkles conformance | `sandbox-sprinkles` manifest/spec |
| Existing real vanilla-extract compatibility manifest | retained in promoted `sandbox-sprinkles` |

Split mixed spec files so tests that navigate to `/` remain in `sandbox`.

Retarget these Canvas specs from `a[href="/tailwind"]` to
`a[href="/conformance"]` and update their names/assertions to describe generic
route discovery:

- `m4-canvas-routes.dev.spec.ts`
- `m4-canvas-board.dev.spec.ts`
- `m4-canvas-element-select.dev.spec.ts`
- `m6-canvas-measurement-guides.dev.spec.ts`

Update `conformance-links.dev.spec.ts` for the retained same-origin routes and
external standalone-app links.

### 7. Add automated isolation contracts

Replace manual isolation spot-checks with Playwright assertions:

- Raw sandbox: a Tailwind-only class such as `px-4` has no matching rule or
  computed effect; its catalog has no `tailwind-v3`, `tailwind-v4`, or
  `vanilla-extract` entries.
- Tailwind v4: expected v4 catalog entries and generated utilities exist;
  Tailwind v3 config names and Sprinkles contract entries do not.
- Tailwind v3: expected utilities exist in compiler output and carry v3 config
  provenance; v4 and Sprinkles entries do not.
- Sprinkles: class/custom-property identifiers are compiler-generated and map
  to human-readable contract paths; Tailwind adapter entries do not.
- Library apps: raw sandbox resets and raw-only token names are absent.

Where showroom chrome necessarily affects computed layout, assert its narrow
selectors explicitly so it cannot masquerade as library output.

### 8. Gate ADR-0002 for every production app

A successful `vite build` is necessary but does not prove production safety.
Create a reusable production Playwright contract and run it against the preview
build of all four apps. It asserts:

- no `data-cid`, `data-src`, or `data-cprops` identity attributes;
- no `#design-tool-root`, Inspector shell, managed stylesheet, or Canvas host;
- no Design Tool session state;
- no runtime token/component catalogs;
- no dev bootstrap or virtual Inspector references in the served document.

Retain the existing static/unit production checks in the plugin. Runtime prod
tests protect against consumer-specific plugin ordering and compiler behavior.

### 9. Wire the test commands by responsibility

Root scripts should make the testing layers visible:

- `test:unit` — CSS grammar/value semantics, adapter logic, plugin integration,
  and compatibility-manifest validation.
- `test:e2e` — canonical sandbox Inspector/Canvas suite plus each standalone
  app's dev compatibility, isolation, and production contract.
- `test:compat` — the three standalone library manifests, useful as a focused
  compatibility command.
- `build` — `pnpm -r build`, still required but not treated as the sole
  ADR-0002 assertion.

Unique ports allow the standalone compatibility suites to run in parallel in
CI. Keep each individual app deterministic (`workers: 1`) unless its fixtures
are proven state-independent.

### 10. Use browser breadth selectively

Run the small, data-led compatibility contract in Chromium, Firefox, and
WebKit because CSSOM serialization and computed-style behavior can differ by
engine. Normalize semantically equivalent values where necessary instead of
asserting one engine's serialization.

Keep the full interaction-heavy Inspector and Canvas suite on Desktop Chromium
initially. Promote a failure-prone flow to all engines only when it represents
a real browser-specific risk.

## Testing architecture

| Layer | Contract | Primary home |
|---|---|---|
| CSS grammar and value semantics | Broad values, shorthands, logical properties, variables, fallbacks, colors, at-rules, and malformed input | Vitest in `packages/css` |
| Vite stylesheet pipeline | Imports, active stylesheet graph, transformed artifacts, source provenance, and virtual catalogs | Unit/integration tests in `packages/plugin` |
| Real-library compatibility | Actual compiler output is attributed, editable, promptable, and stable across ordering/rerenders | Standalone app manifests via `@design-tool/compatibility` |
| Inspector UI | Selection, panels, changes, prompts, managed previews, Canvas, and DOM interactions | Canonical raw sandbox E2E plus small adapter-specific flows |
| Production safety | Complete removal of identity, runtime, catalogs, Inspector, and Canvas | Shared prod contract against every app |
| Browser compatibility | CSSOM/computed-style equivalence across engines | Reduced compatibility manifest on Chromium/Firefox/WebKit |

The exhaustive CSS corpus must not be expressed as thousands of slow UI
interactions. Unit and data-led conformance tests provide breadth; real consumer
apps provide pipeline confidence; a smaller number of UI edit flows prove the
end-user path.

## Framework and build-tool expansion strategy

This plan validates multiple CSS systems within the supported React + Vite
surface. It does not validate Vue, Svelte, Angular, Webpack, Next, or other
deferred integrations.

When support expands, avoid a framework × CSS library × build tool Cartesian
matrix:

- A new CSS library starts with React + Vite.
- A new frontend framework starts with raw CSS + Vite.
- A new build tool starts with React + raw CSS, then one high-risk adapter.
- Add pairwise intersections only where the integration mechanisms genuinely
  interact or a production issue identifies risk.

This keeps failures attributable to one compatibility seam while preserving a
path to broader coverage.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm -r build`
- `pnpm test:compat`
- `pnpm test:e2e`
- Automated isolation assertions pass for all four apps.
- The shared production contract passes against all four preview builds.
- Corpus completeness proves every required spacing, typography, color,
  border, and layout situation is represented per app.

## Non-goals

- No plugin or Inspector product behavior changes; compatibility helpers and
  fixtures may be extended.
- No combined rendered framework showcase.
- No shared CSS or compiled framework output between apps. Sharing data-only
  compatibility contracts and test helpers is allowed.
- No claim of non-React or non-Vite support.
- No full cross-product test matrix across browsers, frameworks, CSS libraries,
  and build tools.
