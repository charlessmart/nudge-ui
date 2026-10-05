# create-nudge-ui

Add Nudge UI to an existing app with one command. `create-nudge-ui` detects your
framework, installs `nudge-ui`, and updates your development configuration. It
can also connect your coding agent so you can send design changes from the browser.

[Nudge UI](https://www.npmjs.com/package/nudge-ui) lets you inspect your running
app, preview visual edits, and turn them into a prompt for a coding agent.

## Get started

From your application's root directory, run:

```sh
npm create nudge-ui@latest
```

Follow the prompts, then start your app with its usual development command and
open the local URL. For static HTML, run the `nudge-ui serve` command printed by
the initializer.

Requires Node.js 20 or later and a supported app. Your framework or build tool
may require a newer Node.js version.

## What setup does

- Detects Next.js, Astro, Vite with React, or a static HTML directory.
- Installs `nudge-ui` as a development dependency using npm, pnpm, Yarn, or Bun.
- Adds the framework integration to your configuration. Static HTML uses the
  bundled development server instead.
- Offers to connect a coding agent through
  [`@nudge-ui/mcp`](https://www.npmjs.com/package/@nudge-ui/mcp).

Run it inside the app directory in a monorepo. If detection is ambiguous, choose
the framework explicitly:

```sh
npm create nudge-ui@latest -- --framework astro
```

## Connect a coding agent

Choose agent setup during initialization, or add it later:

```sh
npm create nudge-ui@latest -- --agent-only
```

Setup installs a bridge dependency in the app and a reusable MCP adapter under
`~/.nudge-ui/adapters/`. It registers the adapter globally for the selected
agents, so other checkouts and Git worktrees can use it. Each app still needs
its own Nudge integration and bridge dependency.

Setup verifies the adapter before changing agent settings. If automatic
configuration fails, it prints a global stdio configuration you
can add manually. npm must be available to install the reusable adapter, even
when your app uses another package manager.

Fully restart your agent host, then ask it to **listen to Nudge in this
workspace**. Keep the agent listening while you send changes from the browser.
The MCP integration is early alpha; host behavior and setup may change.

## Common commands

```sh
# Preview setup without changing files or installing packages.
npm create nudge-ui@latest -- --dry-run

# Install the inspector without agent setup.
npm create nudge-ui@latest -- --no-mcp

# Set up a specific agent without prompts.
npm create nudge-ui@latest -- --agent codex --yes

# Connect an agent to an existing Nudge installation.
npm create nudge-ui@latest -- --agent-only --agent cursor --yes
```

## Options

Pass options after `--` when using `npm create`.

| Option | Purpose |
| --- | --- |
| `--framework <name>` | Select `nextjs`, `astro`, `vite-react`, or `standalone`. |
| `--package-manager <name>` | Select `npm`, `pnpm`, `yarn`, or `bun`. |
| `--mcp` | Enable agent setup. |
| `--no-mcp` | Skip agent setup. |
| `--agent <id>` | Select an agent, such as `codex` or `cursor`. Repeat for multiple agents. Enables agent setup. |
| `--agent-only` | Install or repair agent integration without changing framework configuration. |
| `--yes`, `-y` | Accept defaults without prompts, including setup for detected agents. Use `--no-mcp` to skip agent setup. |
| `--dry-run` | Print planned changes without applying them. |
| `--mcp-package <specifier>` | Use a specific MCP package or local tarball for both the bridge and adapter. |
| `--help`, `-h` | Show command help. |

For troubleshooting and custom integrations, see the
[coding-agent guide](https://github.com/charlessmart/nudge-ui/blob/main/docs/agent-integration.md).
For manual framework setup, see
[`nudge-ui`](https://www.npmjs.com/package/nudge-ui).

## Links

[Repository](https://github.com/charlessmart/nudge-ui) ·
[Issues](https://github.com/charlessmart/nudge-ui/issues) ·
[MIT license](https://github.com/charlessmart/nudge-ui/blob/main/LICENSE)
