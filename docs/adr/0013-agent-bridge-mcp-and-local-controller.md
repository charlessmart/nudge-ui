# ADR-0013: Agent bridge over MCP and a local controller transport

Date: 2026-08-28
Status: Accepted

## Context

Nudge UI currently exports its canonical change set through a clipboard prompt.
The user must paste that prompt into a coding agent, and an agent has no narrow
way to present newly created project routes on the live Canvas board.

MCP provides a portable agent-facing tool boundary, but an MCP server cannot
start an otherwise idle model turn. A browser event can resume work only when
the agent is already executing a listening tool call. The browser also cannot
share the MCP stdio transport that an agent host owns.

The live Canvas is already a controller-owned, same-origin route board
(ADR-0006 and ADR-0012). Agent control therefore does not require a second
renderer protocol; it requires a narrow controller command boundary.

## Decision

Nudge UI uses a two-part, dev-only agent bridge:

1. `@nudge-ui/mcp` is a project-local companion package. An MCP-capable coding
   agent starts it as a standard stdio MCP server.
2. The same companion exposes an authenticated loopback HTTP event transport
   for the top-level Nudge browser controller. The browser never speaks MCP
   directly.

The MCP tools and protocol are agent-host neutral. Codex is the first tested
host, not an architectural dependency. The companion publishes server
instructions that define the listen, acknowledge, complete, and re-listen
workflow.

An agent becomes available only while it is executing the listening tool.
The browser explicitly pairs one active agent with one project workspace.
Pairing authorizes non-destructive status and presentation commands; source
file operations remain subject to the coding agent's own permission model.

Prompt dispatch captures an immutable revision of the canonical changes. One
request may be in flight per project. Disconnecting interrupts the request and
never replays it automatically. After completion, Nudge removes only changes
whose source-backed result it can verify; inconclusive records remain visible
as needing review.

Canvas exposes outcome-oriented agent commands rather than its internal store:

- read the current presentation state;
- append a labeled group of same-origin routes;
- focus or fit that group; and
- remove a group created by the paired agent.

Nudge owns card identity, placement, dimensions, camera calculations, renderer
handshakes, and persistence. Agent-created groups preserve every existing card.
Presentation waits for bounded per-route renderer readiness and reports partial
failure without rolling the group back.

The loopback bridge validates the request origin, project identity, pairing
token, and protocol version. It does not allow wildcard CORS, durable prompt
storage, remote clients, arbitrary URL launching, offline command queues, or
dev-server process management. It may reopen only the last paired project URL
and only while that pairing remains active.

All agent bootstrap and browser probing are statically gated by
`import.meta.env.DEV` in accordance with ADR-0002. Production artifacts contain
no agent UI, bridge discovery, or controller commands.

## Consequences

- Copy prompt remains the fallback when no live agent is paired.
- The primary handoff control reflects connection state: Copy, Connect, Send,
  and Agent working.
- Nudge remains a dispatch-and-status surface rather than an agent chat client.
- Real source-backed routes are the only Canvas presentation inputs in v1.
- Local development is the only supported topology in v1.
- Package installation may register project-local MCP configuration through a
  best-effort host adapter, but registration failure cannot fail dependency
  installation and must provide recovery diagnostics.
- A long-running MCP listen call is the highest-risk portability assumption and
  requires a working-host integration test before the feature is released.

## Verification

- Hermetic companion tests cover pairing, origin rejection, one-in-flight
  dispatch, listener release, status changes, interruption, and controller
  command acknowledgements.
- Inspector tests drive the rendered handoff control through every connection
  and request state while preserving the clipboard fallback.
- Canvas tests prove append-only grouped presentation, same-origin validation,
  durable hydration, selective group removal, and bounded readiness results.
- A Vite sandbox tracer test exercises the complete browser-to-agent-to-Canvas
  path. Compatibility tests cover every host whose runtime advertises Canvas.
- Production strip tests assert that agent bridge strings and network entry
  points are absent.
