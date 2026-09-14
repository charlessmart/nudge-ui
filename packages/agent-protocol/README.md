# Agent protocol

This private workspace module contains the host-neutral TypeScript contracts
used by the Nudge UI browser inspector and its local MCP companion. It defines
the pairing, prompt, status, and Canvas message shapes without importing Node,
React, Vite, or the MCP SDK.

It is the single source for both sides of the loopback bridge. Release builds
compile its implementation and declarations into `nudge-ui` and
`@nudge-ui/mcp`; it is not published or installed as a separate package.

Agent integration is exposed through `@nudge-ui/mcp`. Its `protocol` subpath
provides the companion-facing contracts needed by advanced integrations.
