# ADR-0032: Remove the coupled companion and startup-workspace adapter

Date: 2026-10-08
Status: Accepted
Supersedes: ADR-0026's retained explicitly configured companion, and ADR-0028's retained startup workspace and coupled mode.

## Context

ADR-0026 kept the original companion, in which one agent-owned process runs
both the MCP stdio transport and the browser bridge. ADR-0028 kept two legacy
adapter configurations: that coupled companion, selected by `--origin` with a
deprecation warning, and an adapter restricted to a startup workspace. Since
ADR-0028, setup registers only the reusable adapter, and a setup run in a
project migrates that project's legacy override.

The legacy modes keep a second process-ownership model alive. The browser
derives a fallback port from the project ID because no host publishes a coupled
companion's endpoint. The adapter's tools branch across three routing modes.
The companion reopens the last paired page when no browser stream is attached.
The packages are pre-1.0 and documented as early alpha.

## Decision

Remove both legacy modes. The development integration owns every browser
bridge, and the reusable adapter from ADR-0028 is the only MCP entry point.

- `nudge-mcp` accepts no bridge or project options when serving. The
  `--origin`, `--project-id`, `--host`, `--port`, `--command-timeout-ms`, and
  `--workspace-root` options, and the environment variables that set them,
  stop startup with an instruction to rerun agent setup.
- `nudge-mcp doctor` keeps `--workspace-root` as its diagnostic scope.
- Every tool requires `workspaceRoot`. Session listing, diagnostics, and
  release are always registered.
- The package no longer exports `createAgentCompanion`, and
  `createDiscoveredAgentAdapter` no longer accepts a startup workspace.
- The browser connects only to an endpoint published by trusted host code
  through the client manifest, `window.__NUDGE_UI_AGENT_BRIDGE__`, or the
  `nudge-ui-agent-bridge` meta tag. It no longer derives a port from the project
  ID or reads `window.__NUDGE_UI_AGENT__`. The agent protocol no longer exports
  `defaultBridgePort`.
- The bridge no longer opens the last paired page.

## Consequences

- An agent configuration that passes a removed option fails at startup with a
  recovery command instead of silently running another mode. One
  `npx nudge-ui agent setup` run in each affected project migrates it.
- A page without a published endpoint has no agent connection; it does not
  probe a loopback port.
- MCP tools resolve their target through one path, and each bridge has one
  owner, so session rules can be separated from HTTP handling.
- Tests and smoke checks use project bridges and the reusable adapter.
