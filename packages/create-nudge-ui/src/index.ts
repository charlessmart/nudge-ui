export { parseArguments, helpText, type CliOptions } from "./arguments.ts";
export { configureSource, planConfiguration } from "./configuration.ts";
export {
  adapterPackage,
  detectFrameworks,
  detectPackageManager,
  detectStaticRoot,
  frameworkDisplayName,
  readProjectManifest,
} from "./detection.ts";
export { formatCommand, installCommand, type InstallCommand } from "./installer.ts";
export { frameworks, packageManagers, type Framework, type PackageManager } from "./types.ts";
