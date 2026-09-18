export { parseArguments, helpText, type CliOptions } from "./arguments.ts";
export {
  configureProjectAgents,
  detectProjectAgentCandidates,
  initializerVersion,
  isAgentServerAvailable,
  manualAgentConfiguration,
  planAgentSetup,
  projectAgentChoices,
  projectAgentTypes,
  type AgentInstallOutcome,
  type AgentSetupPlan,
} from "./agent-setup.ts";
export { runAgentSetup, type RunAgentSetupOptions } from "./cli.ts";
export { configureSource, planConfiguration } from "./configuration.ts";
export {
  detectFrameworks,
  detectPackageManager,
  detectStaticRoot,
  frameworkDisplayName,
  readProjectManifest,
} from "./detection.ts";
export { formatCommand, installCommand, type InstallCommand } from "./installer.ts";
export { frameworks, packageManagers, type Framework, type PackageManager } from "./types.ts";
