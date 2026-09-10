# `create-nudge-ui`

`create-nudge-ui` detects an application's host framework, installs the
corresponding Nudge UI adapter, and updates the host configuration.

Run the initializer from the application root:

```sh
npm create nudge-ui@latest
```

The initializer supports Next.js, Astro, Vite with React, and static HTML. Host
frameworks take precedence over their underlying tools, so an Astro project
with React islands receives `@nudge-ui/astro`, not `@nudge-ui/vite-react`.

Use an explicit framework when automatic detection is ambiguous:

```sh
npm create nudge-ui@latest -- --framework astro
```

Use `--dry-run` to print the package installation and configuration change
without modifying the project. Run `npm create nudge-ui@latest -- --help` for
the complete command reference.
