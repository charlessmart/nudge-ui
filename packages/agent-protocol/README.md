# `@nudge-ui/agent-protocol`

`@nudge-ui/agent-protocol` contains the host-neutral TypeScript contracts used
by the Nudge UI browser inspector and its local MCP companion. It defines the
pairing, prompt, status, and Canvas message shapes without importing Node,
React, Vite, or the MCP SDK.

## Install

```sh
pnpm add @nudge-ui/agent-protocol
```

Most application projects do not need to install this package directly. The
Nudge host adapters and `@nudge-ui/mcp` include it as an implementation
dependency. Install it directly when building a custom host or bridge.

## Use

```ts
import {
  AGENT_PROTOCOL_VERSION,
  defaultBridgePort,
  isAllowedOrigin,
  type AgentPromptRequest,
  type CanvasCommand,
} from "@nudge-ui/agent-protocol";

const port = defaultBridgePort("my-app");
const protocolVersion = AGENT_PROTOCOL_VERSION;
```

The package also exports bounded validators for project identities, prompts,
status updates, Canvas state, Canvas commands, origins, and same-origin
routes. `defaultBridgePort()` derives a stable loopback port from a project ID.

## Compatibility

The package is framework-neutral and targets Node.js 20 or newer for package
consumers. Browser-safe consumers can use the contracts and validators without
pulling in the local MCP server.
