# ADR-0015: Browser pairing and agent readiness

Date: 2026-09-05
Status: Accepted
Supersedes: ADR-0013's listener-dependent connection user interface only.

## Context

A running MCP companion can accept browser pairing before the coding agent
calls `nudge_listen`. Requiring that call before exposing connection controls
makes installation appear unsuccessful when the companion is already available.

## Decision

The inspector provides a permanent **Connect MCP** entry in the prompt menu.
It explains project-scoped setup, reports companion reachability, and permits
explicit pairing with a reachable companion independently of listener readiness.
Pairing, readiness to receive a prompt, and work in progress are separate states.

The existing protocol fields remain authoritative. A paired browser can send
only while `listenerActive` is true and no request is working. The companion
continues to validate readiness when accepting a prompt, including races after
the browser's last status update. No prompt is queued for an idle agent.
Copy prompt remains available when sending is unavailable.

Setup commands include the current project ID and exact browser origin. Users
run them from the application root and refresh their MCP host afterward. Copying
a command does not establish that installation or registration succeeded.

Existing origin checks, explicit pairing, credential lifetime, storage keys,
project identity, and dev-only gating remain unchanged. Global registration and
automatic origin discovery require separate verified workspace and authentication
contracts; they are not inferred from an unconfigured process working directory.

## Consequences

- Users can connect a page before asking the coding agent to listen.
- A connected page can be idle; connection does not start an agent turn.
- Connection details and disconnect remain accessible during a request.
- Existing agents and project-scoped configurations remain compatible.
- Client and rendered-control tests cover idle pairing, readiness transitions,
  clipboard fallback, and explicit disconnect.
