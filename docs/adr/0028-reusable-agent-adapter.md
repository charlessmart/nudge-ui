# ADR-0028: Reusable agent adapter with connection-time project selection

Date: 2026-09-24
Status: Accepted
Supersedes: ADR-0026's project-scoped adapter installation and startup-time workspace selection.

## Context

A globally registered adapter can contain the executable and workspace path of
one repository. Other projects then inherit that dependency unless they provide
an override. Moving a checkout, deleting node_modules, and host configuration
reloads make this setup fragile. The development bridge already publishes its
identity and actual endpoint independently of the MCP process.

## Decision

Keep the project-owned authenticated loopback bridges from ADR-0026. Install the
stdio adapter under a versioned per-user directory independent of applications.
Setup uses npm with an explicit prefix, registers an absolute Node executable
and adapter entry globally, and retains the application-local bridge dependency.
The initializer pins the adapter version. Protocol compatibility is checked
against each bridge; incompatible registrations are reported explicitly.

The reusable adapter does not use its startup working directory as task context.
Tools require an absolute workspace or application path. Multiple matching
applications require a session ID. Repeat these arguments on listening, status,
Canvas, and release operations. Selection is retained separately per scope and
explicit session, with application affinity through bridge restarts. A missing
project never falls back to another checkout, even when it is the only live one.
An explicit startup workspace remains supported for legacy configurations.

Setup verifies initialization and tool discovery with a fresh MCP client before
writing agent settings. It backs up existing Nudge entries, replaces the global
entry, and removes the current project's override. It does not scan unrelated
repositories. Existing overrides in other projects need one migration run there.
A successful fresh-client check does not claim the running host has reloaded its
configuration; setup instructs users to restart the host.

Diagnostics distinguish missing, invalid, incompatible, and unreachable records.
Unreachable endpoints are not evidence that registration failed and are not
automatically deleted. Private credentials are never included in diagnostics.
Legacy coupled mode remains available with a deprecation warning.

## Consequences

- Moving between new projects requires no MCP configuration changes.
- Each tool call carries project context, avoiding a process-wide active project.
- Setup needs npm for the managed adapter even when the application uses another
  package manager, and the configured Node executable must remain installed.
- Application bridge and global adapter versions can differ; protocol mismatch
  diagnostics guide users to update both sides.
- Regression tests cover concurrent project workflows, exact path isolation,
  restart affinity, configuration migration, and MCP initialization without a
  development server.
