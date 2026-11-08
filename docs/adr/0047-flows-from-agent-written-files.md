# ADR-0047: Flows from agent-written files

Date: 2026-11-02
Status: Accepted
Supersedes: ADR-0030's deferral of state fixtures, and ADR-0044's "no
agent-initiated Canvas changes" consequence for flows

## Context

Designers review an application as journeys and states: a checkout's loading,
declined and success screens, not a list of URLs. Canvas could only show
routes, so states at one URL were reachable only by clicking through by hand,
one at a time, and were lost on every reload. ADR-0030 left this open: different
states at one URL share a draft, and "state fixtures need a separate design".

ADR-0044 removed MCP because keeping an agent connected was unreliable, while
writing files worked with every agent. Application source must stay untouched,
including test ids or a registry of states that an application would have to
maintain.

## Decision

### Flows are project files

A coding agent writes one `nudge/flows/<id>.json` per flow. Nudge offers the
prompt from a **Flows** inspector tab. The folder is not `.nudge/`: flows are
meant to be committed, and `.nudge/` is ignored by Git and by Vite's watcher.

A flow lists states and edges. A state has a route and, as needed, a `seed` for
web storage, `network` rules and replayable `steps`. A host route shared by
every adapter serves valid flows and says why any other file was refused. The
browser polls it, so no host needs a watcher, and an edit reaches open frames
within seconds.

### A state is a route frame with a recipe

Opening a flow adds one live frame per state, laid out by edge depth with
branches stacked, as one undo step. A frame's content stays `kind: "route"` and
gains a `flowState` binding holding a copy of the recipe, so a restored frame
loads before the file is read. Because the content is still a route:

- **Drafts are unchanged.** States of a page edit that page's draft, so a style
  edit shows in every state where the element exists. The handoff prompt names
  the state the edit was made in.
- Only a changed recipe restarts a frame. Moving a frame or renaming a state does
  not, and a frame's geometry is never taken from the file.

Flow frames are not breakpoints of one view, so they are not linked to other
frames of the route, and opening the route does not focus them.

### The scenario arrives in `window.name`

The hosts' first head script, which already installs the animation clock, now
also installs the scenario. It reads `window.name`, which the iframe sets. That
name survives reloads and in-frame navigation, is readable before any
application script, needs no request, and never appears in the URL or draft
identity. A document without the name's prefix is untouched.

Web storage is copied on first read, then partitioned per frame. Copying keeps
sign-ins working and partitioning keeps frames from leaking into each other.
`fetch`, `XMLHttpRequest` and `sendBeacon` follow the state's network rules.

### Replays may not write

A request other than GET, HEAD or OPTIONS that no rule matches is answered with
a 503 and reported. Recipes click "Pay" and "Delete" against development
backends, unattended, on every reload, so this is the default, not an option a
recipe can forget. A rule's `passthrough` covers read-only POSTs such as GraphQL
queries; a state's `allowMutations` turns blocking off and needs the user's
say-so per the prompt.

### Steps run once per document

The controller runs steps directly in the same-origin frame after the renderer's
handshake, once per document. A hot update keeps its state; a reload reaches it
again. Steps dispatch synthetic events: the renderer's editing gestures only
intercept trusted ones. Link previews ignore clicks while a recipe runs, so a
replayed link click navigates its own frame.

Locators prefer role and accessible name, since no attributes may be added to the
application and source line numbers change with every edit.

### Agents read results from a file

Each replay posts its outcome to the host, which keeps the latest per state in
`.nudge/flows-status.json`: success, the failed step, and blocked requests. An
agent writes, reads the result and repairs its recipes with no connection to
Nudge, which restores the part of the MCP loop that mattered. Frames also show a
failure on the frame itself, since the page beneath looks plausible.

### One reload stream per Canvas

Each document used to hold its own reload `EventSource`. Browsers allow six
HTTP/1.1 connections per origin, so a Canvas of six frames on the Next.js or
static hosts stalled its own requests. Only the top document now holds the
stream, and it relays revisions to renderers over a `BroadcastChannel`.

## Consequences

- Same-URL states can be seen and edited side by side with no application
  changes, and their recipes are reviewable in version control.
- **Server-rendered data cannot be mocked.** Rules run in the browser, so Next.js
  server components and Astro pages need a query parameter, a seeded development
  database, or an HTML iteration of the state.
- **Isolation stops at web storage.** Cookies, IndexedDB and service workers
  remain shared across frames. Signed-in and signed-out states cannot sit side by
  side when sessions live in cookies. Frames start with a copy of the developer's
  own `localStorage` and `sessionStorage`, so a state that must be signed out
  lists the keys to hide in `hideStorage`.
- Every state is a live application instance. Flows open one at a time to limit
  this; frames do not yet unload or fall back to thumbnails when off screen.
- Flows need multi-frame Canvas, so the Chrome extension (ADR-0037) does not have
  them. Astro serves the route and the head script; its Canvas capability decides
  whether the tab appears.
- A browser tab must be open for results to appear in the status file.
- Recording a recipe by clicking, generating missing states, and editing
  transitions on edges are separate decisions.

## Real backends

Testing the same recipes against a real API on another origin and against
Supabase showed what a mocked app hides, and the scenario now accounts for it:

- Reads no rule matches reach the real server with the browser's credentials, so
  each replay reports them as `passedThrough`. Rules that matched nothing are
  reported as `unusedRules`, since a pattern written for one backend silently
  mocks nothing against another.
- A relative rule matches its path on every host. It keeps doing so, because the
  host is often an environment variable, but a match on another host is reported
  as `foreignMatches`, and an absolute pattern such as
  `https://*.supabase.co/rest/v1/*` scopes a rule to one.
- `WebSocket` and `EventSource` connections to other origins are held in
  "connecting" so a frozen state opens no live connection. The page's own origin
  is left alone because dev-server hot reload shares it. `allowRealtime`, or a
  `passthrough` rule naming the host, opts in. Held connections are reported as
  `heldConnections`.
- `expectRoute` names where a state that redirects on purpose should end, so a
  signed-out visit to `/chat` is not reported as a failure.
- Status results for states a file no longer defines are dropped from the status
  file and the route, unless no flow can be read or a file fails to parse.

## Verification

- Unit suites cover the schema, the project route, the scenario, step replay,
  layout, frame content, and the reload relay.
- `examples/standalone-html/tests/flows.spec.ts` opens a flow on a real Canvas
  and checks same-URL states, per-frame storage, blocked writes, the status file,
  live edits and reload.
