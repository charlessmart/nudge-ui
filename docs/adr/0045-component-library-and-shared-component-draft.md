# ADR-0045: Component library and shared component draft

Date: 2026-10-18
Status: Accepted
Supersedes: ADR-0030's restriction of draft targets to pages and HTML
iterations, and ADR-0027's exclusion of component-state orchestration

## Context

Applications rarely show every variant and state of a design-system
component on one page. Editing a rendered callsite also scopes a change to
that page's draft, so a change made to the shared Button on one page never
previews on another. Designers maintain a library beside product work, in the
way Figma's assets panel and sticker sheets work.

Earlier probes asked users to author a `nudge.components.tsx` registry of
examples. Nudge already knows every component with a typed prop contract
(ADR-0007, ADR-0034), so it can lay components out without an authored
format.

## Decision

### Discovery and the library panel

The host's component contracts are the library. Contracts read literal-union
and boolean props, `cva()` and `tv()` variants referenced through
`VariantProps<typeof x>`, literal defaults, and `children` for components
whose props extend a non-void element's props. A left Components panel
lists them, grouping project components by folder and package components by
module. It appears only when the host reports `componentSheet: true`. In this
first version that means the Vite host with the React adapter.

### Component sheet frames

A Canvas frame can show a component sheet:
`{ kind: "component", componentId, name }`. Its document is the dev-only route
`/__nudge_ui__/components?component=<id>`. The host serves the route through
its own HTML transform, so the sheet is an ordinary Canvas renderer.

The sheet entry is generated from the contracts:

- It imports the application's global stylesheets. The host finds them by
  walking the static and dynamic import graph of the HTML entry's module
  scripts. A `componentSheet.styles` option replaces discovery.
- It loads the component through the application's module graph, so the
  compiler instruments the component's own JSX, and HMR and the application's
  single React instance apply.
- It renders rows for the cartesian product of select props, capped, and
  columns for interaction states. A state column is shown when a rule using
  its pseudo-class matches one of the component's own elements, or when a
  contract prop expresses it (`disabled`, `loading`, `checked` and similar).
  A component with no such states turns its last multi-value prop into the
  columns instead.
- It chooses a light or dark backdrop from the rendered text colours, and the
  user can override the choice.

The sheet forces states without events. It copies authored rules,
rewriting each interaction pseudo-class to also match descendants of a cell
that carries the state marker. Its copy is rebuilt when Nudge's managed
stylesheet changes, so state edits show in their column.

A component that throws with generated props shows a placeholder in that cell
rather than breaking the sheet.

### Shared component draft

Every sheet frame edits one draft whose target is `{ kind: "components" }`.
Live route frames receive that draft's source-site style changes ahead of
their own page draft, so a page edit still wins. HTML iterations receive
nothing from it.

Source-site selectors name an element by the JSX position that created it.
Components that spread props onto their root forward the callsite's identity,
so a root rendered in the application carries the callsite's `data-src`. The
compiler therefore also appends `data-nudge-def` after every attribute of a
JSX element that has a spread attribute, including component tags such as
shadcn's `<Comp {...props}>`, so the innermost definition wins. Its value is that element's own
position. Shared rules match `:is([data-src="X"], [data-nudge-def="X"])`.

### Variant scope

A source-site rule matches an element in every variant. Edits made in a sheet
therefore carry a variant scope by default: the component name and the select
props of the selected cell, such as `variant=primary`. The inspector offers
the whole component, each single prop value of the cell, and the cell's full
combination.

Documents mark variants with `data-nudge-ui-variant` tokens such as
`Button.variant=primary`. The sheet marks each cell from the props it
rendered. In live frames the React runtime Adapter marks the root host nodes
of every mounted instrumented invocation whose contract has select or boolean
props. It uses the invocation's current props, falling back to the
contract's default. The inspector client publishes the contracts through
the host runtime registry, because the Adapter has its own dependency graph.

A scoped rule appends `:is(<tokens>, <tokens> *)` to the shared selector. The
descendant form covers the sheet's cell wrapper and elements nested inside
an application root. Selecting an element in a state column also sets the
inspector's style state, so the edit records that pseudo-class.

Prompts for the components draft ask the agent to change the component's own
implementation so every usage changes, and not to edit the pages that use it.

## Consequences

- No user-authored format is needed. Components without typed literal props
  are not listed, and components that need structured props render a
  placeholder.
- A sheet shows generated placeholder content. Storybook stories or authored
  examples can later supply richer fixtures through the same frame kind.
- Global stylesheet discovery follows the entry's import graph, so CSS that
  the application injects at runtime by other means needs the `styles`
  option.
- Next.js, Astro and static hosts do not serve sheets yet, and do not show the
  panel.
- The components draft is shared by every page, so a page draft cannot hide a
  shared change except by overriding the same property.
- Variant markers depend on the React runtime Adapter. Without it, scoped
  edits preview only in the sheet, though the prompt still names the variant.
- A variant marker on an application root also covers instances of the same
  component nested inside it.
