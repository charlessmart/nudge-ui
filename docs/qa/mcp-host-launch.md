# Codex CLI MCP host-launch validation

Date: 2026-09-05

This check validates the Codex CLI launch boundary for a local STDIO MCP
server. It answers which working directory Codex gives the child process and
whether the child reaches the MCP initialization and tool-list requests. It
does not exercise Nudge's browser bridge or a real agent request.

The official OpenAI documentation lists `command`, `args`, and optional `cwd`
as the STDIO server configuration fields. It also documents project-scoped
Codex configuration and the CLI `codex mcp list` command: [Model Context
Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Procedure

Run the bounded probe from the repository root:

```sh
node docs/qa/tools/check-codex-mcp-cwd.mjs
```

The probe launches `codex exec` twice. Each invocation uses
`--ignore-user-config`, `--ephemeral`, `--sandbox read-only`, and dotted `-c`
overrides for a fake MCP command. It gives Codex a temporary `-C` task
directory and starts the parent process from the repository root. The probe
also points `CODEX_HOME` at a temporary directory so the CLI cannot write the
user's state database or configuration.

The fake server records its process cwd and the methods it receives. It
responds to `initialize`, records `notifications/initialized`, and records
`tools/list` without replying to that request. The probe terminates Codex as
soon as `tools/list` is observed. This keeps the host in MCP startup and avoids
starting a model turn or invoking `tools/call`. Temporary files and child
processes are cleaned up after each case.

The two cases are:

1. `explicit`: configure the MCP server's `cwd` as a directory distinct from
   the Codex task directory and the parent spawn directory.
2. `inherited`: omit the MCP server's `cwd` while keeping the distinct Codex
   task directory and parent spawn directory.

## Result

The installed CLI was `codex-cli 0.153.2`. Both cases reached the expected MCP
startup sequence:

```text
initialize
notifications/initialized
tools/list
```

The explicit case observed the configured MCP directory. The probe compares
canonical paths because macOS may report a temporary directory with a
`/private` prefix:

```text
explicit:  outcome=mcp-tools-list-requested
           configured MCP cwd=<temp>/server-cwd
           observed child cwd=<temp>/server-cwd
           cwdMatchesExplicitConfig=true

inherited: outcome=mcp-tools-list-requested
           configured MCP cwd=null
           observed child cwd=<temp>/task-cwd
           inheritedCwdSource=codex-task-cwd
```

Therefore, this CLI version starts a STDIO MCP child in the Codex task root
when `cwd` is omitted. An explicit MCP `cwd` overrides that inherited value.
The parent spawn directory was distinct in both cases, so the observed
inheritance was not the shell's launch directory.

## Limits and recommendation

This is fresh-process evidence. It does not establish that a long-running
Codex TUI, desktop task, or another MCP host refreshes its tool catalog after a
configuration edit. It also does not test concurrent hosts sharing a project
or bridge port. Those remain manual acceptance checks; no registry or broker
is part of this validation.

Keep the Nudge MCP registration project-scoped and retain an explicit project
workspace argument. The observed Codex default is useful diagnostic evidence,
but it should not replace an explicit project path in generated host
configuration until each target host's refresh and concurrency behavior has
been verified.
