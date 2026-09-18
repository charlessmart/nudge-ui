# ADR-0026: Project-owned agent sessions and guided setup

Date: 2026-09-18
Status: Accepted
Supersedes: ADR-0013's companion process ownership and discovery, and ADR-0015's manual configuration and pairing flow for project-managed sessions.

## Context

The original companion combines the MCP stdio transport and browser bridge in
one agent-owned process. Users must register that process with matching project
identity, workspace, and browser origin, pair the browser, and start listening.
Development port changes invalidate configuration. Multiple agent processes can
compete for the same project-derived port. Directory names do not distinguish
clones or worktrees reliably.

The framework integration already knows which application is running. It can
own the browser bridge and publish its actual connection details. The agent
still needs to own its MCP stdio process, and an idle model still requires a user
instruction to start listening.

## Decision

The development integration starts and stops the project browser bridge when
the optional MCP package is installed. The agent launches a separate MCP adapter
that discovers running project sessions. Production integrations remain inert.

Each project session registers its runtime identity and authenticated endpoint
in a private local registry. Public discovery results omit credentials. Registry
entries are validated and probed before use; stale files are not evidence that a
session is running. The bridge remains loopback-only and validates browser
origins. Browser connection details come from trusted development host code.

Canonical filesystem paths identify workspaces and application roots. Git
worktree roots distinguish checkouts; a shared Git directory and branch name
provide context, not permission to select another worktree. Non-Git application
directories are supported. Runtime session identity changes on restart.

The MCP adapter exposes session discovery and an optional session selection on
the listening tool. It automatically selects an unambiguous session in its
configured workspace. Multiple applications require application-specific
selection. It never falls back to another checkout because repository or branch
metadata matches. Selecting another workspace requires configuring the adapter
for that workspace. Agent registration supplies an explicit application path
rather than assuming every harness starts its subprocess in the correct directory.
Setup must be rerun when a checkout moves or an absolute agent configuration is
copied into another worktree. Agent instructions require checking the selected
paths against the checkout being edited.

Only one agent owns a project's active request workflow. Another agent must not
silently replace that owner. A connection may recover after a development
server restart, but interrupted requests are never replayed automatically.
Browser pairing and an active listening call remain separate states. Explicit
browser disconnect revokes the connection and suppresses automatic reattachment.

The initializer offers agent setup after framework setup. It installs matching
packages, registers the locally installed executable in project-scoped agent
configuration, and supports reruns, dry runs, and noninteractive options.
Registration failure reports a recovery command without undoing the working UI
installation. Package install lifecycle scripts do not prompt or mutate agent
configuration. A diagnostic command reports session availability separately
from configuration and listener readiness.

The legacy explicitly configured companion remains available for existing
integrations. Global harness registration is not required for the guided flow.

## Consequences

- Users start the application normally and ask their agent to listen to Nudge.
- Origin and endpoint changes no longer require editing agent configuration.
- Worktree and monorepo selection use filesystem identity instead of port or
  branch heuristics.
- Optional package resolution keeps MCP dependencies outside browser bundles.
- Framework adapters must manage startup, shutdown, and host-origin trust.
- Registry files contain connection credentials and require private permissions.
- Prompts stay in memory, require a live listener, and are never queued for
  automatic execution later. Pending-request storage is a separate decision.
- Source edits remain subject to the agent harness's normal approval behavior.

## Verification

Tests exercise separate worktrees and same-branch clones, ambiguous applications,
stale registrations, credential omission, unauthorized requests, competing
agents, shutdown and restart, browser disconnect, and request interruption.
Installer tests verify persisted configuration and recovery behavior. Framework
checks exercise actual endpoints, while production and package verification
prove that agent bootstrap does not leak into production browser artifacts.
