export { createAgentCompanion, type AgentCompanion, type AgentCompanionOptions } from "./server.ts";
export {
  createLoopbackBridge,
  type BrowserBridge,
  type BrowserBridgeOptions,
  type BridgeAddress,
  type BridgeClock,
  type CanvasCommandInput,
} from "./bridge.ts";
export {
  createNoopRegistrar,
  createProjectLocalCodexRegistrar,
  type AgentRegistrar,
  type AgentRegistrarContext,
  type ProjectLocalCodexRegistrarOptions,
  type RegistrarFileSystem,
  type RegistrationResult,
} from "./registrar.ts";
export {
  openPairedPage,
  parseCliArguments,
  runCli,
  type CliOptions,
  type PageLaunchDependencies,
} from "./cli.ts";
export * from "./protocol.ts";
