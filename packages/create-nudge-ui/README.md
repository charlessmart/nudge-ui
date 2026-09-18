# `create-nudge-ui`

`create-nudge-ui` detects an application's host framework, installs the
corresponding Nudge UI adapter, and updates the host configuration. The guided
setup can also connect a coding agent to the project-local Nudge MCP server.

Run the initializer from the application root:

```sh
npm create nudge-ui@latest
```

The initializer supports Next.js, Astro, Vite with React, and static HTML. Host
frameworks take precedence over their underlying tools, so an Astro project
with React islands receives `nudge-ui/astro`, not `nudge-ui/vite`.

In an interactive terminal, the initializer asks whether to connect a coding
agent. It detects installed agents, installs the matching `@nudge-ui/mcp`
version in the project, and adds a project-scoped MCP entry. The entry launches
the package from this project's `node_modules` directory and passes the
canonical workspace path, so different Git worktrees do not share a server
configuration.

Reload an agent that was already running, then ask it to “listen to Nudge.”

Use an explicit framework when automatic detection is ambiguous:

```sh
npm create nudge-ui@latest -- --framework astro
```

Use `--dry-run` to print the package installation and configuration change
without modifying the project. Run `npm create nudge-ui@latest -- --help` for
the complete command reference.

For scripts, select the MCP behavior explicitly:

```sh
# Configure detected agents without prompts.
npm create nudge-ui@latest -- --mcp --yes

# Configure one or more supported add-mcp agent IDs.
npm create nudge-ui@latest -- --mcp --agent codex --agent cursor --yes

# Skip agent setup.
npm create nudge-ui@latest -- --no-mcp
```

Use agent-only mode to add or repair the integration without changing the host
framework configuration:

```sh
npm create nudge-ui@latest -- --agent-only --agent codex --yes
```

Agent configuration is best-effort. If an agent is not supported or its native
configuration cannot be updated, the initializer prints the complete stdio
configuration to add to that agent's project settings. Other MCP servers and
agent settings are preserved on every run.
