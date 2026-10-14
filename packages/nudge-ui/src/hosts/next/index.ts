export {
  withNudgeUi,
  type NudgeUiNextConfig,
  type NudgeUiNextOptions,
  type RewritesShape,
  type RewritesSource,
} from "./wrapper.ts";
export { buildManifest, nextjsProjectId, type NudgeUiManifest } from "./manifest.ts";
export {
  ensureSidecar,
  clearStaleSidecarState,
  type SidecarHandle,
} from "./sidecar.ts";
export {
  transformNextModuleSource,
  hasUseClientDirective,
  directivePrologueEnd,
  instrumentRootLayout,
  type NextModuleTransformOptions,
  type NextModuleTransformResult,
} from "./loader.ts";
// `./loader-plugin.cts` is CommonJS by contract and deliberately not re-exported through this ESM surface.
