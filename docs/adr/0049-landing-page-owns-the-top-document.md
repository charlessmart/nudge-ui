# ADR-0049: The landing page owns the top document

Date: 2026-11-04
Status: Accepted
Supersedes: ADR-0027's rule that the public landing page loads in the shared
iframe editor.

## Context

ADR-0027 moved the public landing demo into the iframe editor. Visiting `/`
booted the editor shell in the top document, rewrote the URL to
`?nudge-ui=editor`, and rendered the landing page only inside Canvas frames
in the inspector's shadow root. The top document had no heading or text.

Search engines index the document at the URL they fetch. Content in iframes
is credited mostly to the iframe's own URL, and here the main frame's URL was
`/` itself, which rendered the same empty shell. nudgeui.com stopped ranking
after the change.

## Decision

The landing page renders in the top document at every route. The editor
boots only from an explicit editor URL.

- **Open action.** The page's open actions, **Try it here** in the hero and
  **Open Nudge** in the demo section, dispatch `nudge-ui:open`. The demo
  bootstrap then navigates to the editor URL for the current route, which keeps
  the path, query and hash. This is the same reload ADR-0027 used for the
  direct-application view, which is no longer a special case.
- **Panel state.** A one-shot `sessionStorage` entry, removed as the editor
  reads it, opens the panel when the editor is reached from an open action. A
  refresh still opens collapsed in Focus, as ADR-0027 requires, and the demo
  still leaves no storage behind.
- **Indexing.** The editor document adds `<meta name="robots"
  content="noindex">`. The landing HTML declares `https://nudgeui.com/` as
  canonical, which also covers the `?landing-version=` cards, and the site
  publishes a sitemap listing it.
- **Unchanged.** The editor, its seeded V1, V2 and Final cards, Canvas, and the
  demo restrictions on persistence, leasing and agent access follow ADR-0027.

## Consequences

- Crawlers see the hero heading, copy and links in the top document at `/`.
- Opening the demo costs a full navigation into the editor, about half a
  second. The landing page holds almost no state, so the reload loses nothing
  visible.
- No collapsed restore button floats over the landing page until the editor
  opens. The page's own buttons are the only way in.
- The Chrome and npm install buttons move out of the hero, which now leads
  with **Try it here**. They are in the install section further down.
