# create-nudge-ui

Add Nudge UI to an existing app with one command. `create-nudge-ui` detects your
framework, installs `nudge-ui`, and updates your development configuration.

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

Run it inside the app directory in a monorepo. If detection is ambiguous, choose
the framework explicitly:

```sh
npm create nudge-ui@latest -- --framework astro
```

## Common commands

```sh
# Preview setup without changing files or installing packages.
npm create nudge-ui@latest -- --dry-run

```

## Options

Pass options after `--` when using `npm create`.

| Option | Purpose |
| --- | --- |
| `--framework <name>` | Select `nextjs`, `astro`, `vite-react`, or `standalone`. |
| `--package-manager <name>` | Select `npm`, `pnpm`, `yarn`, or `bun`. |
| `--yes`, `-y` | Accept defaults without prompts. |
| `--dry-run` | Print planned changes without applying them. |
| `--help`, `-h` | Show command help. |

For manual framework setup, see
[`nudge-ui`](https://www.npmjs.com/package/nudge-ui).

## Links

[Repository](https://github.com/charlessmart/nudge-ui) ·
[Issues](https://github.com/charlessmart/nudge-ui/issues) ·
[MIT license](https://github.com/charlessmart/nudge-ui/blob/main/LICENSE)
