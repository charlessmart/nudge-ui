# ADR-0026: Keep the agent protocol private

## Status

Accepted. This supersedes ADR-0024 only where it counts
`@nudge-ui/agent-protocol` as a published package. Its distribution decision
remains in effect.

## Context

The browser inspector and local MCP companion exchange pairing, prompt,
status, and Canvas messages over an authenticated loopback transport. They
must compile against one protocol vocabulary, but that implementation detail
does not form a separate product boundary.

Users choose between the visual inspector in `nudge-ui` and the optional,
bidirectional agent connection in `@nudge-ui/mcp`. Publishing the shared
contracts separately adds a fourth package to every release and suggests that
custom bridges are a supported product surface. Nudge UI does not need to make
that compatibility promise before its first consolidated release.

Moving the contracts into either public package would create the wrong
dependency direction. The browser package must not depend on the Node and MCP
runtime, and the companion must not depend on the full inspector distribution
to share a small wire contract.

## Decision

Keep `packages/agent-protocol` as a private workspace package and the single
source for the loopback wire contract. It remains free of Node, React, build
tool, and MCP SDK dependencies.

During release builds, compile the protocol implementation and declarations
into both `nudge-ui` and `@nudge-ui/mcp`. Rewrite their emitted imports to the
package-local copies so neither published archive has a runtime dependency on
the private workspace package. Package verification rejects a missing copy or
an emitted import of `@nudge-ui/agent-protocol`.

The protocol version remains part of every message and is the runtime
compatibility boundary between separately installed versions of `nudge-ui`
and `@nudge-ui/mcp`. The companion continues to expose its supported contracts
through `@nudge-ui/mcp/protocol`; the private workspace package is not a public
extension point.

## Consequences

- Releases publish three packages: `nudge-ui`, `@nudge-ui/mcp`, and
  `create-nudge-ui`.
- Users install `nudge-ui` for the inspector and add `@nudge-ui/mcp` only when
  they want the bidirectional agent connection.
- The protocol implementation appears in both public archives. Its small size
  is preferable to a public package and an extra install-time dependency.
- `@nudge-ui/agent-protocol` stops receiving releases at 0.1.3 and should be
  deprecated on npm as an internal package after the 0.2.0 release is live.
- A future third-party bridge API requires a deliberate ADR and public
  compatibility policy rather than inheriting one from the workspace layout.
