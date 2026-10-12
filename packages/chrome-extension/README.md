# Chrome extension

Build `nudge-ui` before building the extension:

```sh
pnpm --filter nudge-ui build
pnpm --filter @nudge-ui/chrome-extension build
```

Load this package's `dist` directory as an unpacked extension in Chrome.
Reload the extension in `chrome://extensions` after rebuilding it.

Pages with a meta CSP that blocks the preview show a short security-policy
error. Pages controlled by a site service worker show a service-worker error;
this also applies to workers that currently forward requests to the network.

Run the installed-extension browser tests after building `nudge-ui`:

```sh
pnpm --filter sandbox test:extension
```
