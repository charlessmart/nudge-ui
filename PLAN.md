# Design Tool — Plan Document

> A visual design editor for the browser that lets you tweak UI live, then copy a structured prompt to your AI coding agent to implement the change. Think "Chrome DevTools meets Cursor" — but as an npm package that runs in your local dev environment.

---

## Thesis

The current agent loop is slow: describe a change in chat → agent writes code → check the result → describe the next change. Designers are used to Figma-speed iteration — drag, see, undo, adjust. This tool closes that gap by letting you edit visually in the running app, see changes instantly, and hand off a precise prompt that the agent can act on without ambiguity.

**What it's not:** a Chrome extension that works on any site. A production tool. A live agent bridge (yet).

**What it is:** a dev-only npm package + Vite plugin that runs in your local dev server, pulls real design tokens from your codebase, lets you edit them live with a beautiful UI, and generates agent-ready prompts with source-level precision.

---

## Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Distribution | npm package + Vite plugin | Target is localhost dev. Extension's "any site" advantage doesn't apply. Single install surface, browser-agnostic, tree-shakes out of prod. |
| Source mapping | Runtime fiber-walking (`_debugSource` / `__source`) | Works on most dev builds via `@babel/preset-react` / SWC. No dependency on Locator.js or React DevTools extension. Component name + props + file:line captured from the fiber tree. |
| Style application | Managed `<style>` sheet keyed by stable element identity | Never inline styles (React clobbers them on re-render). External stylesheet survives re-renders naturally. Hard rule, same as Design Mode's CONTRIBUTING.md. |
| Token extraction | Universal CSS-var core + adapter pattern | Core works on any project using CSS custom properties (most modern design systems). Adapters add enrichment for specific frameworks. No adapter = still useful. |
| Component prop editing | Typed contract catalog + framework runtime adapters | Scalar presentational props rerender the real component. Project TS contracts are inferred; npm design systems may publish a manifest. CSS inference is not used as a semantic substitute. |
| DOM mutations (drag) | Record-and-replay, no live reconciliation | React re-renders clobber DOM moves. We record structured change records and detect snap-back, with clear UX messaging. Not a live Figma-feel drag — honest about the limitation. |
| Canvas | Live same-origin iframe previews, controller/renderer architecture | Real application renders inside iframes with current canonical changes projected in. No screenshots in v1 — every card is a live interactive preview. See `docs/features/live-canvas-workspace.md`. |
| Agent handoff | Clipboard-paste prompt (v1), MCP server (v2) | v1: structured text prompt with file:line, component, token name, before→after. v2: live MCP bridge where agent calls into the browser. |
| UI isolation | Shadow DOM React portal | Host app CSS can't leak in or out. Use host's React instance via Vite aliasing if possible; fall back to bundled React (~40KB) for version safety. |
| Cross-tab sync | **Out of scope for v1** | Canvas re-capture shows the effect of token changes across pages. Sync via BroadcastChannel is a possible v2 but not needed for the core value prop. |
| Build-tool support | Vite-first | Webpack/CRA/Next deferred. Vite covers the primary audience. Non-Vite users are out for v1 — name it explicitly. |
| Framework support | React-first | Fiber-walking is React-specific. Vue/Svelte/Angular adapters are possible later but not v1. |

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────┐
│  Host app (Vite dev server)                      │
│                                                  │
│  ┌─────────────────────┐  ┌──────────────────┐  │
│  │  Vite plugin        │  │  App code        │  │
│  │  (build time)       │  │  (React)         │  │
│  │                     │  │                  │  │
│  │  • AST transform:   │  │  data-cid        │  │
│  │    inject data-cid, │  │  data-src        │  │
│  │    data-src on JSX  │  │  on every JSX    │  │
│  │                     │  │  element         │  │
│  │  • Parse token      │  │                  │  │
│  │    table from       │  └──────────────────┘  │
│  │    :root vars +     │                        │
│  │    adapters         │  ┌──────────────────┐  │
│  │                     │  │  Inspector UI    │  │
│  │  • Inject inspector │  │  (Shadow DOM     │  │
│  │    mount point in   │  │   React portal)  │  │
│  │    dev mode only    │  │                  │  │
│  └─────────────────────┘  │  • Click-to-     │  │
│                           │    select         │  │
│                           │  • Token panel    │  │
│  ┌──────────────────┐     │  • Style editors  │  │
│  │  Managed <style> │◄────│  • Canvas view    │  │
│  │  sheet (injected)│     │  • Prompt output  │  │
│  │  keyed by         │     └──────────────────┘  │
│  │  data-cid/src    │                           │
│  └──────────────────┘                           │
└─────────────────────────────────────────────────┘
```

### 1. Vite plugin (build time)

**Two jobs:**

**A. AST transform — inject stable element identity**

Visit every JSX element in `.tsx`/`.jsx` files and inject:
- `data-cid` — component name (from the enclosing function/class)
- `data-src` — `file:line:column` (from the AST node location)
- `data-cprops` — serialised primitive props (string/number/boolean only; functions rendered as `fn(name)`)

These attributes survive React re-renders because the plugin re-injects on every rebuild. They're the stable identity layer that the managed stylesheet and prompt generator key off.

```tsx
// Before:
<Button variant="primary" onClick={handleClick}>Save</Button>

// After (in dev only):
<Button variant="primary" onClick={handleClick}
  data-cid="Button"
  data-src="src/components/Header.tsx:42:8"
  data-cprops="variant:primary">Save</Button>
```

Wrapped in `import.meta.env.DEV` so it's stripped from production builds entirely.

**B. Token table generation**

Parse the project's CSS for custom property definitions:
- `:root { --foo: ... }` — standard CSS vars
- `@theme { --foo: ... }` — Tailwind v4
- Any `@layer` or `@scope` declarations containing custom properties

Ship the token table to the runtime via a virtual module (`virtual:design-tokens`) that the inspector imports. The table is a flat map of `{ name: string, value: string, source: string, adapter?: string }`.

Adapters extend the table with framework-specific metadata (see below).

### 2. Token extraction — universal core + adapters

**Universal core (no adapter needed):**

Walk all `document.styleSheets` at runtime. For each CSSOM-declared rule containing `var(--something)`:
1. Resolve the custom property through the cascade to find its declaration site.
2. Match the resolved name against the build-time token table.
3. Present the token name (not the resolved value) in the UI.

If a computed value doesn't resolve to a known token, show the raw value with a "not a token" indicator. This handles the case where an element has hardcoded values instead of token references.

**Adapter interface:**

```ts
interface TokenAdapter {
  name: string;                    // "vanilla-extract" | "tailwind-v3" | etc.
  detect(): boolean;               // "is this project using this framework?"
  extractTokens(): TokenEntry[];   // contribute rows to the token table
  resolveClassName?(cls: string): TokenMapping | null;  // optional: map utility class → token
}
```

**Adapters, in build order:**

| Adapter | Effort | Why this one |
|---|---|---|
| vanilla-extract / sprinkles | Low | Work codebase uses it. Tokens are TS objects whose leaf values are `var(--hashed-name)` strings — just import and walk the object tree. Gives human-readable names (`theme.color.brand`) for hashed CSS vars. |
| Tailwind v3 | Medium | Huge market share. Parse `tailwind.config.js`, build class→token map. |
| Tailwind v4 | Medium | CSS-first config via `@theme`. Different parser, growing adoption. |
| CSS-in-JS (styled-components, emotion) | High — deferred | Tokens in JS objects, runtime-injected. Fragmented. v2+. |

### 3. Inspector UI (runtime, Shadow DOM)

**Injection model:** The Vite plugin injects a `<div id="design-tool-root">` mount point into the document body in dev mode. The inspector renders into this as a Shadow DOM React portal, fully isolated from host app CSS.

**React strategy:** Alias the inspector's `react` import to the host app's React via Vite config, so there's one React instance at runtime. If version mismatch causes issues, fall back to bundling a separate React into the Shadow DOM (~40KB gzipped).

**UI surfaces:**

**A. Element selector (click-to-select)**
- Toggle with keyboard shortcut (e.g. `Alt+I`)
- Hover highlights elements with an outline overlay (rendered in the Shadow DOM, positioned over the target)
- Click selects — resolves the element to its `data-cid` / `data-src` / fiber data
- Hierarchy stepping: arrow up/down to walk between the clicked DOM node and its enclosing component boundary (like Chrome inspector's breadcrumb). Resolves the ambiguity of "did they click the DOM node or mean the component?"

**B. Token panel**
- For the selected element, show all CSS properties that resolve to a known token
- Each property displays: property name, current token name, resolved value, and a dropdown of alternative tokens of the same type (color tokens swap with color tokens, spacing with spacing, etc.)
- Inline edit: change the token → writes a rule to the managed stylesheet → see it live
- "Not a token" indicator for hardcoded values, with a "replace with token" affordance

**C. Style editors (beyond tokens)**
- Spacing box (Figma-style: padding/margin with per-side controls)
- Typography (font-size, weight, line-height, letter-spacing)
- Color picker (with site-palette dropdown from token table)
- Border, radius, shadow
- All edits go through the managed stylesheet, never inline styles

**D. Changes log**
- Every edit recorded as a structured change: `{ elementId, property, oldValue, newValue, tokenName?, source: { file, line, component } }`
- Grouped by element
- Single-change revert
- "Copy prompt" button → generates the agent prompt from all changes

**E. Canvas (live previews)**
- Mode toggle between Inspect (single-page editing) and Canvas (multi-route inspection/editing) in the Design Tool header
- Canvas renders as a fixed Shadow DOM workspace above the still-mounted host page
- Each card is a same-origin iframe showing a live route with current canonical changes projected
- Cards support Reload, Edit (handoff to Inspect), and Remove
- Route-link navigation within cards discovers new cards or focuses existing ones
- Tracked elements inside cards can be selected and edited through the top-level Inspector
- Controller owns all selection/edit authority; renderers only report element intents and display canonical projections

**F. Prompt output**
- Structured markdown format, optimised for agent consumption
- Each change includes: component name, file:line (from `data-src`), property, before→after, token name if applicable
- Framework + styling-system detection header (so the agent knows it's vanilla-extract, Tailwind, etc.)
- Grep-ready selectors as fallback when source mapping is uncertain
- Compact format — avoid dumping entire CSS blocks

**Example prompt:**

```markdown
# Design changes for Header.tsx

Framework: React + vanilla-extract (sprinkles)

## Changes

### Button (src/components/Header.tsx:42)
- `background`: `theme.color.surface.raised` → `theme.color.surface.sunken`
- `border-radius`: `4px` → `8px` (not a token — consider adding one)

### Nav links (src/components/Header.tsx:58)
- `color`: `theme.color.text.secondary` → `theme.color.text.primary`
- `font-weight`: `400` → `500`

## Selectors (fallback)
- `[data-cid="Button"][data-src*="Header.tsx"]`
- `[data-cid="NavLink"]`
```

### 4. Managed stylesheet (style application layer)

A single `<style id="design-tool-styles">` element injected into the document head. All style edits are written as rules here, never as inline styles on elements.

**Rule format:**
```css
[data-cid="Button"][data-src*="Header.tsx:42"] {
  background: var(--color-surface-sunken);
  border-radius: 8px;
}
```

Keyed by `data-cid` + `data-src` (component identity + source location) rather than DOM selectors, which drift across re-renders and reorders.

**Why this works:**
- React doesn't touch `data-*` attributes it didn't create, so the selector stays valid
- The stylesheet is external to the React tree, so React re-renders don't clobber it
- Rebuilding the sheet is trivial — iterate the change log, emit rules

**Snap-back detection (for future drag feature):** A `MutationObserver` watches for React removing elements that have pending changes. When detected, show a toast: "This edit will reapply after reload — apply via agent to make permanent."

---

## Build order

Each milestone is independently shippable and demoable.

### Milestone 1 — Foundation
**Vite plugin: `data-cid` + `data-src` injection + token table from `:root` vars**

- Vite plugin that visits JSX AST and injects `data-cid`, `data-src`, `data-cprops` in dev mode
- Token table parser: walk CSS files for `:root` / `@theme` custom properties, ship via virtual module
- Verify on a simple React + CSS-vars sandbox app
- Verify tree-shaking: confirm attributes are absent in production build

**Demo:** Inspect the DOM and see `data-cid` / `data-src` attributes on every JSX element. Import the virtual token module and see the token table.

### Milestone 2 — Core loop
**Click → highlight → token panel → edit via managed stylesheet → copy prompt**

- Shadow DOM mount point injection
- Element selector: hover highlight, click-to-select, hierarchy stepping
- Token panel: show resolved tokens for selected element, dropdown of alternatives
- Managed stylesheet: edits write rules, not inline styles
- Changes log: record every edit with source metadata
- Prompt generator: structured markdown output with file:line, component, token names
- Keyboard shortcut to toggle inspector on/off

**Demo:** Click a button → see it's using `--color-surface-raised` → swap to `--color-surface-sunken` → see it update live → copy prompt → paste into Cursor → code changes.

### Milestone 3 — vanilla-extract adapter
**Token names for the work codebase**

- Detect vanilla-extract / sprinkles in the project
- Import theme contract objects, walk the tree to build `humanName → var(--hashed-name)` map
- Enrich the token table with human-readable names
- Verify on the actual work codebase (the real testbed)

**Demo:** Click an element in the work app → see `theme.color.brand` instead of `--color-brand__1g5vs1s0` → edit → prompt references `theme.color.brand` (the thing an agent can grep for).

**Semantic component slice:** For React/Vite, discover typed enum/boolean props
from project components or an npm design-system manifest. Instrument consuming
JSX invocation sites in dev, preview through the React runtime adapter, and
record `component-prop` intent separately from CSS/token changes (ADR-0007).

### Milestone 4 — Canvas
**Live same-origin iframe previews; controller/renderer separation**

- Split dev bootstrap into top-level controller and embedded renderer roles (ADR-0006)
- Inspector/Canvas mode toggle in the Design Tool UI; Inspect remains the default
- Fixed Shadow DOM Canvas workspace with live cards for current-route(s)
- Renderers announce readiness, current URL, and title; no nested Inspector
- Renderer element intents populate the controller-owned Inspector without giving frames edit authority
- Shared edit projection via versioned postMessage (feature plan #0031)
- Link-discovered route cards and edit handoff (#0032)
- Responsive spatial Canvas board with pan/zoom (#0033)
- Durable Canvas and stable edit restoration (#0034)
- Restore safety and single-workspace ownership (#0035)

**Demo:** Switch to Canvas, select a tracked element in any live card, and edit it from the top-level Inspector. Navigate within a card to create new route cards and see the canonical change projected into every live card. Return to Inspect — the same host page is still editable.

### Milestone 5 — Drag *(optional / v1.5)*
**Record-and-replay DOM drag with snap-back detection**

- Drag handle overlay on selected element
- On drag: move the DOM node immediately (live feedback)
- Record a structured change: `{ action: "move", elementId, from: { parent, index }, to: { parent, index }, outerHTML }`
- MutationObserver: detect when React removes the moved element (snap-back)
- Toast on snap-back: "This move will reapply after reload — apply via agent to make permanent"
- Prompt output includes the move as a structured instruction

**Demo:** Drag a nav item to a new position → see it move → if it snaps back, see the toast → copy prompt includes "move NavItem from position 2 to position 0."

*This milestone is the most likely to feel janky. It's last for a reason — the rest of the tool is valuable without it.*

### Milestone 6 — Tailwind adapters
**Market coverage**

- Tailwind v3: parse `tailwind.config.js`, build class→token map
- Tailwind v4: parse `@theme` CSS, build token table
- Utility-class awareness in the token panel: show `bg-blue-500` as `color.blue.500` from the theme

**Demo:** Click a Tailwind-styled element → see the utility class resolved to its theme token → edit → prompt references the Tailwind class / config key.

### Milestone 7 — MCP server *(v2)*
**Live agent bridge**

- WebSocket server (Node, runs locally)
- MCP tools: `get_changes`, `apply_changes`, `get_screenshot`, `clear_changes`
- Agent calls into the browser live — no copy-paste
- Structured tool semantics (richer than Design Mode's flat `get_changes`): separate `get_token_change` / `get_style_change` / `get_layout_change` with source-mapped metadata

**Not in scope for v1. Build only if the clipboard-paste loop proves insufficient.**

---

## Key technical constraints

1. **Never write inline styles to tracked elements.** CSS/token previews go
through the managed `<style>` sheet. Semantic component prop previews rerender
through a framework runtime Adapter under ADR-0007; they never mutate rendered
host styles or attributes directly.

2. **Tree-shaking must be airtight.** All plugin transforms and inspector injection must be gated behind `import.meta.env.DEV`. One stray import that isn't dev-gated ships an inspector into production. Verify with a production build at every milestone.

3. **`data-*` attributes are the identity layer.** React doesn't touch `data-*` attrs it didn't create, so injected `data-cid` / `data-src` survive re-renders. This is the foundation that makes the managed stylesheet and prompt output work. Don't rely on DOM selectors (fragile across reorders) or fiber refs (change across renders).

4. **Source mapping is best-effort, not guaranteed.** `_debugSource` and `__source` depend on the dev build's React transform. If they're absent, fall back to `data-cid` (component name) + DOM selector. The prompt should always include a selector fallback when source location is uncertain.

5. **html2canvas has rendering gaps.** Some CSS (certain fonts, effects, transforms, web fonts) may render incorrectly in screenshots. Accept this for v1 — the canvas is for comparison, not pixel-perfect reproduction. Consider `modern-screenshot` as a more accurate alternative.

6. **Vite-only for v1.** Webpack, CRA, Next.js, Turbopack users are out. Name this explicitly in docs. The AST transform and virtual module pattern are Vite-specific; porting to other build tools is a separate effort.

---

## What we explicitly defer

| Feature | Why deferred |
|---|---|
| Cross-tab sync (BroadcastChannel) | Canvas re-capture shows the effect of changes. Sync adds complexity without a clear v1 value prop once canvas exists. |
| MCP server | Clipboard-paste is sufficient for v1. MCP is significant infrastructure (WebSocket, server, SDK) and is invisible in a portfolio demo. |
| Chrome extension | Wrong shape for localhost-dev target. Would double the install surface. |
| Live DOM reconciliation for drag | Unsolved by anyone. Record-and-replay with honest messaging is the pragmatic path. |
| Non-React frameworks | Fiber-walking is React-specific. Vue/Svelte adapters are possible but separate work. |
| Non-Vite build tools | Vite covers the primary audience. Webpack/Babel/SWC plugins are porting effort. |
| CSS-in-JS adapters (styled-components, emotion) | High effort, fragmented audience, tokens in JS objects. v2+. |
| Write-back-to-source | The "agent edits source files directly" endgame. Requires dev-server file access. v2+ via MCP. |

---

## Reference implementations

- **Design Mode** ([github.com/SandeepBaskaran/design-mode](https://github.com/SandeepBaskaran/design-mode)) — Chrome extension doing similar work. Studied for architecture decisions. Key differences: they're extension-based (we're npm), per-URL persistence (we're session-based), heuristic token extraction (we're adapter-driven with build-time ground truth), MCP server (we defer to v2).
- **Locator.js** ([github.com/infi-pc/locatorjs](https://github.com/infi-pc/locatorjs)) — Click-to-component source mapping. Studied for fiber-walking approach. We don't depend on it; we implement our own fiber walk to capture component name + props + source.
- **`@babel/plugin-transform-react-jsx-source`** — The standard Babel transform that injects `__source` on JSX elements. This is why runtime fiber-walking works without a custom build plugin for source mapping. Our `data-cid` / `data-src` injection is a richer version of the same idea.
