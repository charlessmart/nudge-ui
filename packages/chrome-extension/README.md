# Chrome extension

Build `nudge-ui` before building the extension:

```sh
pnpm --filter nudge-ui build
pnpm --filter @nudge-ui/chrome-extension build
```

Load this package's `dist` directory as an unpacked extension in Chrome.
Reload the extension in `chrome://extensions` after rebuilding it.

The toolbar button runs the inspector in the current page without reloading
it, so page state is kept. The page is the only card: the extension has no
Canvas frames or iframe editor (see ADR-0037).

Run the installed-extension browser tests after building `nudge-ui`:

```sh
pnpm --filter sandbox test:extension
```
