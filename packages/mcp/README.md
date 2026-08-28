# `@nudge-ui/mcp`

`@nudge-ui/mcp` connects a local Nudge UI inspector to an MCP-capable coding
agent. It combines a standard MCP stdio server with a project-scoped loopback
browser bridge. The browser does not speak MCP directly.

## Install

```sh
pnpm add -D @nudge-ui/mcp
```

The postinstall hook may add a marked `nudge_ui` entry to the current project's
`.codex/config.toml`. It skips CI, preserves unrelated configuration, leaves an
existing user-owned `nudge_ui` entry untouched, and treats every file error as
non-fatal. The entry uses a long tool timeout because `nudge_listen` is an
intentional long-lived call.

## Run manually

```sh
pnpm exec nudge-mcp --project-id my-app --workspace-root /path/to/my-app
```

Omit `--origin` to trust and lock the first browser origin. The bridge chooses
a deterministic loopback port from the project ID so the inspector can find
it without a port file. Use `--port 0` for an ephemeral test port.

The agent should call `nudge_listen`, apply the delivered prompt through its
normal source-editing workflow, call `nudge_report_status`, and listen again.
Canvas tools are limited to same-origin routes and agent-owned groups.
