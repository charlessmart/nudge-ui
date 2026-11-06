# ADR-0046: Library visibility from structure, and a sheet wrapper for providers

Date: 2026-11-01
Status: Accepted
Supersedes: ADR-0045's statement that a sheet renders a component bare, and the library's hiding of package
wrappers by name

## Context

The library hides providers, guards and other components that render no UI of their own. For project source it
reads the component body. A package's declaration files carry no body, so the library fell back to a name pattern
(`…Provider`, `…Context`, `…Portal`, `…Boundary`). A pattern like that needs maintaining, hides a real component whose
name happens to match, and misses a wrapper whose name does not.

A sheet also mounts each component on its own, outside the application's root. A component that reads context
throws, and its cell showed "Needs props" with no way to fix it short of editing the component.

## Decision

### Wrapper detection reads props

A package contract gets `role: "wrapper"` when its export is React's `Provider` type, or when it takes `children`, has
no styling surface (`className`, `class`, `style`, `css`, `sx`, or any prop inherited from a DOM attribute
interface), and has no select or boolean prop. A component with a variant axis is a wrapper only when its name also
ends in `Provider`, `Context`, `Boundary` or `Portal`, because showing a wrapper costs one click and hiding a real
component removes it from the library. The name pattern now applies only to contracts read from a package manifest,
which has no types to inspect.

### The user's calls outrank detection

`.nudge/library.json` holds `{ version: 1, hidden: [componentId], shown: [componentId] }`. The Vite host serves it at
`/__nudge_ui__/library` (GET, and PUT for same-origin requests). A component in `hidden` is listed with the other
hidden components; one in `shown` is listed normally even when detection took it for a wrapper. A component in both
is hidden. Each library row has a hide or show action. The file lives under `.nudge/`, which an application may or may
not commit; committing it shares the calls.

### The sheet wrapper

The sheet wraps every cell in the default export of a project file: `componentSheet.wrapper` in the plugin options,
else the first of `nudge.sheet.tsx`, `.jsx`, `.ts`, `.js` in the project root. The wrapper receives
`children` and `component: { id, name }`. The sheet entry imports it on demand, so a wrapper that fails to load is
reported in the sheet and cells render without it. Creating or deleting the file refreshes open sheets. The file is
excluded from the type-aware component roots.

When cells throw, the sheet shows a banner ("2 of 2 cells can't render") and a **Copy setup prompt** action. The
prompt names the component, the distinct error messages and the wrapper path, says whether to create or update the
file, and constrains the agent: reuse the application's own providers, prefer light stand-ins for side effects, and
leave the component alone. A cell that fails now reads "Can't render" with the message as its tooltip.

## Consequences

- Package wrappers are found without a list. The remaining name pattern covers an ambiguous case and manifests.
- A package component with `children`, only text props and no styling surface (a tooltip, a dialog root) is hidden.
  Unhide it from the library.
- A package component without a styling surface but with a variant axis and no wrapper-like name stays visible.
- The wrapper is per cell, so providers mount once per cell. A provider that must be a singleton needs its own guard.
- The sheet cannot tell a missing provider from a missing prop it could not generate. The prompt says so.
- Only the Vite host with the React adapter serves these routes and sheets, as in ADR-0045.
- Project-source wrappers are still found by tag names in the component body. Resolving those tags with the
  type checker, and probing at runtime whether a component draws any element, would remove that pattern too.
