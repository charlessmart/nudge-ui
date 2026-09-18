export {
  createAgentCompanion,
  createDiscoveredAgentAdapter,
  type AgentCompanion,
  type AgentCompanionOptions,
  type DiscoveredAgentAdapter,
} from "./server.ts";
export {
  DiscoveredProjectRouter,
  discoverProjectSessions,
  type DiscoveredProjectSession,
} from "./discovery.ts";
export {
  defaultSessionRegistryRoot,
  resolveWorkspaceRoot,
  startProjectBridge,
  type ProjectBridgeOptions,
  type ProjectBridgeRuntime,
  type ProjectSession,
} from "./project.ts";
export {
  createLoopbackBridge,
  type BrowserBridge,
  type BrowserBridgeOptions,
  type BridgeAddress,
  type BridgeClock,
  type CanvasCommandInput,
} from "./bridge.ts";
export {
  openPairedPage,
  parseCliArguments,
  runCli,
  type CliOptions,
  type PageLaunchDependencies,
} from "./cli.ts";
export * from "./protocol.ts";
