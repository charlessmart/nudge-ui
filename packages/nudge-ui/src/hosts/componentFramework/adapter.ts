import type {
  ComponentCatalog,
  ComponentContract,
  ComponentModuleAdapter,
  ComponentModuleProtocols,
  HostComponentPolicy,
  PackageComponentImport,
  ResolveHostComponentPolicyOptions,
} from "../../compiler/index.ts";
import type { SourceMap } from "magic-string";
import type { ComponentFramework } from "../../inspector/componentSemantics/types.ts";
import type { NudgeUiRuntimeFramework } from "../../inspector/runtime/runtimeConfig.ts";
import type { ContractRunner } from "./typeAwareContracts.ts";

export interface FrameworkInstrumentOptions {
  /** False for sources outside the project: identity attributes only, no component callsites. */
  instrumentComponents: boolean;
  hostPolicy?: HostComponentPolicy;
  /** Bare specifier the instrumented module imports its runtime from; defaults to `runtimeModules.components`. */
  componentRuntimeModule?: string;
}

export interface FrameworkInstrumentResult {
  code: string;
  map: SourceMap | null;
  /** The exact single line prepended to bind the runtime, or null; hosts with a directive prologue relocate it. */
  prelude: string | null;
}

/**
 * Everything a host needs to know about one UI framework's components, and nothing about a bundler.
 * Hosts (Vite, Next.js) own resolution, routes and HMR; an adapter owns syntax, contracts and the browser runtime.
 */
export interface ComponentFrameworkAdapter {
  /** The framework recorded in change records and runtime targets. */
  readonly id: ComponentFramework;
  /** The label hosts publish as the runtime's `framework`. */
  readonly label: NudgeUiRuntimeFramework;
  /** Source files whose components this adapter instruments and reads contracts from. */
  readonly sourceFile: RegExp;
  /** Packages a dev server must resolve to the application's single copy. */
  readonly singletonPackages: readonly string[];
  /** Exact specifiers aliased to the application's copy when Nudge serves its own demo. */
  readonly singletonSpecifiers: readonly string[];
  readonly runtimeModules: {
    /** Imported by instrumented modules: callsite registration and the runtime Adapter. */
    readonly components: string;
    /** Mounts a component sheet in the browser; null when the framework has no sheet renderer yet. */
    readonly sheet: string | null;
  };
  /** Classic script that must run before the application's renderer loads, or null. */
  readonly documentHeadScript: string | null;
  /** Conventional files whose default export wraps every sheet cell, in order of preference. */
  readonly sheetWrapperFiles: readonly string[];
  /** Compatibility catalog merged under host-supplied protocols. */
  readonly defaultProtocols: ComponentModuleProtocols;

  /** Tags elements with source identity and registers component callsites; null when nothing changed. */
  instrument(code: string, id: string, root: string | undefined, options: FrameworkInstrumentOptions): FrameworkInstrumentResult | null;
  /** Decides which callsites may be wrapped, by resolving where each rendered component comes from. */
  resolvePolicy(
    code: string,
    id: string,
    modules: ComponentModuleAdapter,
    options: ResolveHostComponentPolicyOptions,
  ): Promise<HostComponentPolicy>;
  /** Contracts a single file's syntax can prove, plus its wrapper components. */
  extractFileContracts(code: string, catalogPath: string): ComponentCatalog;
  /** Package components a file renders, so declared types are read only for what the app uses. */
  collectPackageImports(code: string, file: string): PackageComponentImport[];
  extractPackageContracts(hostFile: string, imports: readonly PackageComponentImport[]): ComponentContract[];
  /** A project-wide checker pass, run off the main thread; absent when syntax is all the adapter reads. */
  createTypeAwareRunner?(): ContractRunner;
  /** True when a sheet cannot import this module in the browser, such as a module that is server-only. */
  isServerOnlyModule?(code: string): boolean;
}
