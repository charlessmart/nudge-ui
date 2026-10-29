# ADR-0044: Remove the MCP integration and add pages from the Canvas

Date: 2026-10-24
Status: Accepted
Supersedes: ADR-0013, ADR-0015, ADR-0026, ADR-0028, ADR-0032.
Amends: ADR-0030's agent-owned frame groups.

## Context

The optional `@nudge-ui/mcp` adapter has shipped since ADR-0013 and was reduced
to one discovery-based entry point by ADR-0032. In practice it is rarely used.
Its central capability, a long-lived `nudge_listen` call that resumes an agent
turn, remains the least reliable part of the product: hosts time out tool calls,
an idle turn cannot be started, deliveries expire after 60 seconds, and the
adapter and bridge must be upgraded and restarted together.

Meanwhile the parts of the workflow that matter do not need MCP:

- The prompt, source locations, comments, and iteration instructions are
  produced in the browser and can be copied.
- Reconciliation after a handoff already verifies the live page independently
  of any agent transport.
- HTML iterations are edited on disk and reloaded by a frame poll, so the
  iteration loop works with any agent that can edit a file.
- Component contracts and component sheets are compiled and host-served.

The adapter also carries a persistent cost: a second published package, a
private protocol package, a loopback HTTP bridge in every host, agent
configuration writing, session discovery and diagnostics, a Playwright bridge
suite, release tooling, six ADRs, and a settings section that every user sees
even when no adapter is installed.

The only capability without an equivalent was the agent adding same-origin
routes to the Canvas with `nudge_present_routes`.

## Decision

Delete the MCP integration.

- Remove `@nudge-ui/mcp` and `@nudge-ui/agent-protocol`, the browser agent
  client and its HTTP transport, the settings connection dialog, the agent
  status button, the agent-route presentation adapter, project bridge startup in
  the Vite, Next.js, Astro, and static hosts, the `agentBridge` manifest field,
  and the `features.mcp` flag.
- Remove `nudge-ui agent setup` and `nudge-ui agent doctor`, the initializer's
  agent options and configuration writers, and `add-mcp`; the initializer only
  configures the host adapter.
- Remove the adapter from package verification, release validation, the publish
  matrix, and the packed-consumer expectations. Existing published versions
  remain installable, but no new version is published and no migration tool is
  provided.
- Copying a prompt is the only handoff. Reconciliation after copy continues to
  use the existing clipboard checkpoint and live-page verification.
- Add an **Add page** control to the Canvas toolbar. It accepts a same-origin
  route, focuses the frame already showing that route, or adds a new frame. It
  also lists saved HTML iterations under `.nudge/artifacts` and opens one at its
  captured viewport size, reusing an existing frame when one already shows it.
- Remove agent-owned Canvas frame groups. Sessions ignore legacy `groups` and
  `groupId` values instead of discarding the whole layout.
- Keep the agent activity overlay and its in-memory store, but leave it unwired.
  A file-based source that maps changed source files to rendered elements is a
  separate decision; until then the overlay does not render.
- Remove the protocol's sketch attachment types along with the package. Sketches
  stay local images that are copied to the clipboard.

## Consequences

- No agent-initiated Canvas changes and no request status, activity, or session
  discovery. Presenting newly created routes is a user action through **Add
  page** or link navigation.
- Every host starts without a loopback bridge, bearer token, session registry, or
  agent configuration, and production purity checks have one less surface.
- The Canvas gains a path to reopen artifacts that are not currently framed and
  to add routes without navigating a frame.
- Handoff speed returns to one copy and paste; there is no zero-paste path.
- An installed adapter from an earlier version connects to a bridge this version
  no longer starts, so it fails to discover a session instead of half-working.

## Verification

- Unit suites cover the artifact listing endpoint, adding a saved iteration at
  its captured size, and reusing the frame that already shows it.
- Inspector tests cover copying prompts, the Shift+S shortcut, and unchanged
  clipboard reconciliation.
- Boundary, purity, package verification, and release validation run without
  the removed packages; the packed-consumer suite no longer installs the adapter.
