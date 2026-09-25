# `create-nudge-ui`

`create-nudge-ui` detects an application's host framework, installs the
corresponding Nudge UI adapter, and updates the host configuration. The guided
setup can also connect a coding agent to Nudge.

Run the initializer from the application root:

```sh
npm create nudge-ui@latest
```

The initializer supports Next.js, Astro, Vite with React, and static HTML. Host
frameworks take precedence over their underlying tools, so an Astro project
with React islands receives `nudge-ui/astro`, not `nudge-ui/vite`.

In an interactive terminal, the initializer asks whether to connect a coding
agent. It detects installed agents, installs the matching `@nudge-ui/mcp`
version in the project, and installs a versioned reusable adapter under
`~/.nudge-ui/adapters/`. The adapter is independent of the application and
does not contain a project path, so different Git worktrees can use the same
global MCP registration. Existing project-scoped Nudge entries are backed up
and removed when the host supports that migration.

Fully restart the agent host, then ask it to “listen to Nudge.”

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

For local MCP package testing, pass a tarball with `--mcp-package`. Setup uses
that artifact for both the project bridge and reusable adapter:

```sh
npx nudge-ui agent setup --mcp-package /absolute/path/to/nudge-ui-mcp.tgz
```

Agent configuration is best-effort. If an agent is not supported or its native
configuration cannot be updated, the initializer prints the complete stdio
configuration to add to that agent's project settings. Other MCP servers and
agent settings are preserved on every run.
