import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createRequire } from "node:module";
import { z } from "zod";
import type {
  AgentDeliveredPrompt,
  AgentProjectIdentity,
  AgentRequestOutcome,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  CanvasCommandResult,
} from "@nudge-ui/agent-protocol";
import {
  createLoopbackBridge,
  type BrowserBridge,
  type BrowserBridgeOptions,
  type BridgeAddress,
} from "./bridge.ts";
import { DiscoveredProjectRouter, type DiscoveredProjectSession } from "./discovery.ts";

export const MCP_SERVER_NAME = "nudge-ui";
export const MCP_SERVER_VERSION = readPackageVersion();

function readPackageVersion(): string {
  const metadata: unknown = createRequire(import.meta.url)("../package.json");
  if (
    typeof metadata !== "object"
    || metadata === null
    || !("version" in metadata)
    || typeof metadata.version !== "string"
  ) {
    throw new TypeError("@nudge-ui/mcp package metadata has no version.");
  }
  return metadata.version;
}

/** Instructions are sent through MCP initialization for every host. */
export const MCP_SERVER_INSTRUCTIONS = [
  "Nudge UI is a local browser companion for one exact project workspace or Git worktree.",
  "Before listening, compare each session's workspaceRoot and appRoot with the checkout and application you will edit; if they differ, rerun Nudge agent setup in the intended checkout.",
  "When the user asks to listen to Nudge, call nudge_list_sessions when that tool is available; if several apps are running, select only a session marked matchesApplication.",
  "Call nudge_listen (or nudge_connect) and keep the call open while waiting for a browser request; the bridge may be running before a listener exists.",
  "After a prompt is delivered, edit the project source using the host's normal approval flow.",
  "Report completed, failed, or interrupted status with nudge_report_status before listening again.",
  "When the user asks to stop listening, call nudge_release when that tool is available so another agent can claim the project session.",
  "Canvas tools operate only on same-origin routes from the paired project.",
  "No request, prompt, or browser state is persisted by this companion.",
].join(" ");

export interface AgentCompanionOptions extends BrowserBridgeOptions {
  readonly workspaceRoot?: string;
  readonly serverName?: string;
  readonly serverVersion?: string;
}

export interface AgentCompanionStartResult {
  readonly address: BridgeAddress;
}

export interface AgentCompanion {
  readonly bridge: BrowserBridge;
  readonly mcpServer: McpServer;
  readonly project: AgentProjectIdentity;
  start(transport?: Transport): Promise<AgentCompanionStartResult>;
  close(): Promise<void>;
}

function textResult(value: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

function errorResult(error: unknown): { isError: true; content: [{ type: "text"; text: string }] } {
  const message = error instanceof Error ? error.message : "The Nudge companion could not complete the operation.";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  };
}

function promptResult(request: AgentDeliveredPrompt): {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" }
  >;
} {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" }
  > = [{
    type: "text",
    text: JSON.stringify({
      requestId: request.requestId,
      projectId: request.projectId,
      prompt: request.prompt,
      ...(request.changeRevision === undefined ? {} : { changeRevision: request.changeRevision }),
      ...(request.clientDispatchId === undefined ? {} : { clientDispatchId: request.clientDispatchId }),
      ...(request.sketches === undefined ? {} : { sketches: request.sketches }),
    }),
  }];
  for (const attachment of request.attachments ?? []) {
    content.push(
      { type: "text", text: `Sketch image: ${attachment.filename}` },
      { type: "image", data: attachment.data, mimeType: attachment.mimeType },
    );
  }
  return { content };
}

function commandResult(result: CanvasCommandResult): { content: [{ type: "text"; text: string }]; isError?: boolean } {
  return {
    ...(result.ok ? {} : { isError: true as const }),
    ...textResult(result),
  };
}

function boundedWorkspaceRoot(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 4096) throw new TypeError("workspaceRoot must be a bounded non-empty string");
  return value;
}

interface AgentToolTarget {
  waitForPrompt(signal?: AbortSignal, sessionId?: string): Promise<AgentPromptRequest>;
  getStatus(): AgentStatusSnapshot | Promise<AgentStatusSnapshot>;
  updateRequestStatus(update: AgentStatusUpdate | AgentRequestOutcome): void | AgentStatusSnapshot | Promise<AgentStatusSnapshot | void>;
  dispatchCanvasCommand(command: import("./bridge.ts").CanvasCommandInput): Promise<CanvasCommandResult>;
  listSessions?(): Promise<readonly DiscoveredProjectSession[]>;
  release?(): Promise<void>;
}

function installTools(mcpServer: McpServer, bridge: AgentToolTarget): void {
  const listen = async (args: { sessionId?: string }, extra: { signal: AbortSignal }) => {
    try {
      return promptResult(await bridge.waitForPrompt(extra.signal, args.sessionId));
    } catch (error) {
      return errorResult(error);
    }
  };

  const listenDescription = "When the user asks to listen to Nudge, wait for one browser prompt. Keep this standard MCP call open, then call nudge_report_status and listen again after the request ends.";
  const emptyInput = {} as const;
  const listenInput = bridge.listSessions ? { sessionId: z.string().uuid().optional() } : emptyInput;
  mcpServer.registerTool("nudge_listen", {
    title: "Listen for Nudge requests",
    description: listenDescription,
    inputSchema: listenInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, listen);
  mcpServer.registerTool("nudge_connect", {
    title: "Connect to Nudge",
    description: "Open the long-lived Nudge browser connection and wait for one prompt.",
    inputSchema: listenInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, listen);

  mcpServer.registerTool("nudge_get_status", {
    title: "Get Nudge status",
    description: "Read the in-memory browser pairing and request status for this project.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => textResult(await bridge.getStatus()));

  if (bridge.listSessions) {
    mcpServer.registerTool("nudge_list_sessions", {
      title: "List Nudge project sessions",
      description: "List live local Nudge sessions. Only sessions marked matchesApplication can be selected by an application-scoped adapter.",
      inputSchema: emptyInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => textResult(await bridge.listSessions!()));
  }

  if (bridge.release) {
    mcpServer.registerTool("nudge_release", {
      title: "Release Nudge session",
      description: "Stop listening and release this adapter's project-session claim so another agent can connect.",
      inputSchema: emptyInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => {
      try {
        await bridge.release!();
        return textResult({ released: true });
      } catch (error) {
        return errorResult(error);
      }
    });
  }

  mcpServer.registerTool("nudge_report_status", {
    title: "Report Nudge request status",
    description: "Report working, completed, failed, or interrupted status for the prompt currently being handled.",
    inputSchema: {
      requestId: z.string().min(1).max(256),
      status: z.enum(["working", "completed", "failed", "interrupted"]),
      summary: z.string().max(32_000).optional(),
      error: z.string().max(32_000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    const update: AgentStatusUpdate = {
      requestId: args.requestId,
      status: args.status,
      ...(args.summary === undefined ? {} : { summary: args.summary }),
      ...(args.error === undefined ? {} : { error: args.error }),
    };
    try {
      const updated = await bridge.updateRequestStatus(update);
      return textResult(updated ?? await bridge.getStatus());
    } catch (error) {
      return errorResult(error);
    }
  });

  mcpServer.registerTool("nudge_read_canvas", {
    title: "Read Canvas state",
    description: "Read the paired browser's current Canvas groups and focus.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      return commandResult(await bridge.dispatchCanvasCommand({ type: "read-state" }));
    } catch (error) {
      return errorResult(error);
    }
  });

  mcpServer.registerTool("nudge_present_routes", {
    title: "Present routes in Canvas",
    description: "Append or focus an agent-owned, labeled comparison group of same-origin project routes in Canvas.",
    inputSchema: {
      label: z.string().min(1).max(160),
      groupId: z.string().min(1).max(256).regex(/^agent-[A-Za-z0-9._:-]+$/).optional(),
      routes: z.array(z.object({
        url: z.string().min(1).max(2048),
        title: z.string().max(512).optional(),
        label: z.string().max(160).optional(),
      }).strict()).min(1).max(64),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (args) => {
    try {
      return commandResult(await bridge.dispatchCanvasCommand({
        type: "present-routes",
        groupId: args.groupId ?? `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        label: args.label,
        routes: args.routes,
      }));
    } catch (error) {
      return errorResult(error);
    }
  });

  mcpServer.registerTool("nudge_focus_canvas_group", {
    title: "Focus Canvas group",
    description: "Focus an existing Canvas comparison group by its stable group ID.",
    inputSchema: { groupId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    try {
      return commandResult(await bridge.dispatchCanvasCommand({ type: "focus-group", groupId: args.groupId }));
    } catch (error) {
      return errorResult(error);
    }
  });

  mcpServer.registerTool("nudge_fit_canvas", {
    title: "Fit Canvas",
    description: "Fit all current Canvas cards into the browser board.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      return commandResult(await bridge.dispatchCanvasCommand({ type: "fit-all" }));
    } catch (error) {
      return errorResult(error);
    }
  });

  mcpServer.registerTool("nudge_remove_canvas_group", {
    title: "Remove agent Canvas group",
    description: "Remove an agent-owned Canvas comparison group. The browser refuses removal of user-owned groups.",
    inputSchema: { groupId: z.string().min(1).max(256).regex(/^agent-[A-Za-z0-9._:-]+$/) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    try {
      return commandResult(await bridge.dispatchCanvasCommand({ type: "remove-group", groupId: args.groupId }));
    } catch (error) {
      return errorResult(error);
    }
  });
}

/**
 * Creates one project-scoped MCP companion and its loopback browser bridge.
 * The returned companion is inert until `start` is called.
 */
export function createAgentCompanion(options: AgentCompanionOptions): AgentCompanion {
  const workspaceRoot = boundedWorkspaceRoot(options.workspaceRoot);
  const bridge = createLoopbackBridge(options);
  const mcpServer = new McpServer(
    {
      name: options.serverName ?? MCP_SERVER_NAME,
      version: options.serverVersion ?? MCP_SERVER_VERSION,
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  installTools(mcpServer, bridge);
  const project: AgentProjectIdentity = {
    projectId: options.projectId,
    ...(bridge.origin === null ? {} : { origin: bridge.origin }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  };
  let startPromise: Promise<AgentCompanionStartResult> | null = null;
  let closePromise: Promise<void> | null = null;
  let transport: Transport | null = null;

  const start = (providedTransport?: Transport): Promise<AgentCompanionStartResult> => {
    if (closePromise) return Promise.reject(new Error("The Nudge companion is closing."));
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const address = await bridge.start();
      transport = providedTransport ?? new StdioServerTransport();
      await mcpServer.connect(transport);
      return { address };
    })();
    return startPromise;
  };

  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (transport) {
        try {
          await mcpServer.close();
        } catch {
          // The SDK may already close a transport after a client disconnect.
        }
      }
      await bridge.close();
    })();
    return closePromise;
  };

  return {
    bridge,
    mcpServer,
    project,
    start,
    close,
  };
}

export interface DiscoveredAgentAdapter {
  readonly mcpServer: McpServer;
  readonly router: DiscoveredProjectRouter;
  start(transport?: Transport): Promise<void>;
  close(): Promise<void>;
}

/** Creates a stdio MCP adapter that discovers project-owned bridges. */
export async function createDiscoveredAgentAdapter(options: {
  readonly workspaceRoot: string;
  readonly registryRoot?: string;
  readonly serverName?: string;
  readonly serverVersion?: string;
}): Promise<DiscoveredAgentAdapter> {
  const router = await DiscoveredProjectRouter.create(options.workspaceRoot, options.registryRoot);
  const mcpServer = new McpServer(
    {
      name: options.serverName ?? MCP_SERVER_NAME,
      version: options.serverVersion ?? MCP_SERVER_VERSION,
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  installTools(mcpServer, router);
  let transport: Transport | null = null;
  let started = false;
  let closePromise: Promise<void> | null = null;
  return {
    mcpServer,
    router,
    async start(providedTransport?: Transport): Promise<void> {
      if (started) return;
      if (closePromise) throw new Error("The Nudge MCP adapter is closing.");
      started = true;
      transport = providedTransport ?? new StdioServerTransport();
      await mcpServer.connect(transport);
    },
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        await router.close();
        if (transport) await mcpServer.close().catch(() => undefined);
      })();
      return closePromise;
    },
  };
}
