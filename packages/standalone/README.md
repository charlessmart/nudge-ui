# `@nudge-ui/standalone`

`@nudge-ui/standalone` provides the Nudge UI host for static HTML projects. It
serves a directory on loopback, instruments HTML responses in memory, watches
source files, and reloads the browser after changes.

## Install

```sh
pnpm add -D @nudge-ui/standalone
```

## Start the local host

```sh
pnpm exec nudge-ui serve ./prototype
```

The server listens on loopback at port `4173` by default. Use `--port` to
select another port:

```sh
pnpm exec nudge-ui serve ./prototype --port 4174
```

The host does not serve dot-prefixed files or directories, including `.env`
files. It reserves the `/__nudge_ui__` route namespace for inspector assets
and the local manifest transport.

## Programmatic use

Custom static hosts can import `createStandaloneServer`, `instrumentHtml`,
`injectStandaloneBootstrap`, and the watcher and manifest helpers from the
package root. Use these APIs when the built-in CLI does not match the host's
server lifecycle.
