import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import {
  basename,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type {
  Alias,
  ConfigEnv,
  ModuleNode,
  Plugin,
  ResolvedConfig,
  UserConfig,
  UserConfigExport,
  ViteDevServer,
} from "vite";
import {
  createTokenInventory,
  type ArtifactStage,
  type InventoryDiagnostic,
} from "@nudge-ui/css/token-inventory";
import { injectIdentity } from "./transform/injectDataCid.ts";
import { discoverCssImportGraph, stripCssQuery } from "./tokens/activeStylesheets.ts";
import {
  catalogSourcePath,
  createViteStylesheetArtifact,
  isHostApplicationSource,
  isPackageStylesheet,
  orderViteStylesheetGraph,
} from "./tokens/viteStylesheetArtifacts.ts";
import type { ViteSourceScopeOptions } from "./tokens/viteStylesheetArtifacts.ts";
import type { TokenCatalogDiagnostic } from "./virtual/design-tokens.ts";
import { createTailwindV4NamingContribution } from "./adapters/tailwindV4.ts";
import { createTailwindV3Adapter } from "./adapters/tailwindV3.ts";
import type { TailwindV3Config } from "./adapters/tailwindV3.ts";
import { createSprinklesAdapter } from "./adapters/vanillaExtract.ts";
import { isRecord } from "./adapters/isRecord.ts";
import type { ThemeContract, VanillaExtractAdapterOptions } from "./adapters/vanillaExtract.ts";
import { createPublishedVanillaExtractContribution } from "./adapters/vanillaExtractContract.ts";
import { createTokenAdapterRegistry } from "./adapters/registry.ts";
import { extractComponentContracts } from "./components/extractContracts.ts";
import {
  collectPackageComponentModules,
  extractPackageComponentContractCatalog,
} from "./components/extractPackageContracts.ts";
import type { ComponentContract } from "./components/types.ts";
import {
  detectStylingSystem,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "@nudge-ui/inspector/client-manifest";
import {
  defaultReactComponentProtocols,
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  mergeComponentModuleProtocols,
  resolveHostComponentPolicy,
  type ComponentInstrumentationOptions,
  type ComponentModuleProtocols,
} from "@nudge-ui/compiler";

export interface NudgeUiOptions {
  enabled?: boolean;
  /** Enables experimental DOM parent/child navigation in the Inspector. */
  debug?: boolean;
  /**
   * Enables the landing app's explicit demo runtime. The landing document
   * mounts the demo inspector at its root in development and in `nudge-demo`
   * builds; `?nudgeDemo=1` remains available for explicit demo routes.
   */
  demo?: boolean;
  /** Explicit project ID for browser-storage keys (defaults to root directory basename). */
  projectId?: string;
  /**
   * Skip the React aliases used only by the legacy bundled landing demo.
   * @deprecated Normal development clients no longer add React aliases.
   */
  skipReactAliases?: boolean;
  /** Optional static v3 config for fixture/app integrations; dynamic configs are not executed. */
  tailwindV3?: { config: TailwindV3Config; source?: string };
  vanillaExtract?: VanillaExtractAdapterOptions;
  /**
   * Optional package contract overrides. Local TSX and package declaration
   * contracts are discovered automatically; explicit metadata fills gaps for
   * packages whose public type graph cannot describe an editable prop.
   */
  componentMetadata?: ComponentContract[];
  /**
   * Package exports whose component protocol is explicitly compatible with
   * semantic preview instrumentation. The host resolves project imports;
   * package imports remain fail-closed unless listed here or described by a
   * component protocol.
   */
  compatibleComponentImports?: ComponentInstrumentationOptions["compatibleComponentImports"];
  /** Additional package or project component protocols resolved by the host Adapter. */
  componentProtocols?: ComponentModuleProtocols;
  /**
   * Authored workspace directories outside Vite's resolved root.
   *
   * The Vite host owns this list because only it knows which workspace
   * packages are part of the application. Dependencies and generated output
   * remain excluded even when a broad directory is supplied.
   */
  sourceRoots?: readonly string[];
}

/**
 * Adds the Vite host Adapter to an existing Vite configuration export.
 *
 * Vite configuration exports may be objects, promises, or functions that
 * receive the current command and mode. Resolve those forms at the same
 * boundary where Vite resolves the host configuration so the Adapter can
 * keep ownership of its runtime root and dependency graph.
 */
export function withNudgeUi(
  config: UserConfigExport,
  options: NudgeUiOptions = {},
): UserConfigExport {
  if (typeof config === "function") {
    // SAFETY: The typeof guard above selects the function form of UserConfigExport, whose signature this cast states.
    const resolveConfig = config as (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
    return (env: ConfigEnv) => appendNudgeUi(resolveConfig(env), options);
  }
  return appendNudgeUi(config, options);
}

function appendNudgeUi(
  config: UserConfig | Promise<UserConfig>,
  options: NudgeUiOptions,
): UserConfig | Promise<UserConfig> {
  if (isPromiseLike<UserConfig>(config)) {
    return Promise.resolve(config).then((resolved) => appendNudgeUi(resolved, options));
  }
  if (hasNudgeUiPlugin(config.plugins)) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ...nudgeUi(options)],
  };
}

function hasNudgeUiPlugin(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasNudgeUiPlugin(entry));
  return typeof value === "object"
    && value !== null
    && "name" in value
    && typeof value.name === "string"
    && value.name.startsWith("nudge-ui");
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}

export type { ComponentContract, ComponentPropContract, ComponentPropValue } from "./components/types.ts";

const VIRTUAL_TOKENS_ID = "virtual:design-tokens";
const RESOLVED_TOKENS_ID = "\0" + VIRTUAL_TOKENS_ID;
const VIRTUAL_INSPECTOR_ID = "virtual:nudge-ui-inspector";
const RESOLVED_INSPECTOR_ID = "\0" + VIRTUAL_INSPECTOR_ID;
const VIRTUAL_COMPONENTS_ID = "virtual:nudge-ui-components";
const RESOLVED_COMPONENTS_ID = "\0" + VIRTUAL_COMPONENTS_ID;
const CSS_EXT = /\.css(?:$|[?#])/;
const COMPONENT_EXT = /\.(?:tsx|jsx)(?:$|[?#])/;
const CLIENT_PATH = "/__nudge_ui__/client.mjs";
const MANIFEST_PATH = "/__nudge_ui__/manifest";
const packageRequire = createRequire(import.meta.url);
let inspectorClientPath: string | undefined;

const MOUNT_DIV = `<div id="nudge-ui-root"></div>`;
const DEBUG_MOUNT_DIV = `<div id="nudge-ui-root" data-nudge-ui-debug="true"></div>`;
const INSPECTOR_SCRIPT = `<script type="module" src="${CLIENT_PATH}" data-nudge-ui-client data-nudge-ui-manifest="${MANIFEST_PATH}"></script>`;
const LEGACY_INSPECTOR_SCRIPT = `<script type="module" src="/@id/__x00__virtual:nudge-ui-inspector"></script>`;

/**
 * Extracts the stylesheet string Vite embeds in dev CSS-module JS wrappers
 * (`const __vite__css = "…"`). Returns null for anything that is not such a
 * wrapper, so callers can feed the original code unchanged.
 */
export function extractViteModuleCss(code: string): string | null {
  const match = /(?:^|;)\s*(?:const|let|var)\s+__vite__css\s*=\s*("(?:[^"\\]|\\.)*")/m.exec(code);
  if (!match) return null;
  try {
    // SAFETY: match[1] is the quoted string literal captured by the regex above, and JSON.parse is wrapped in try/catch.
    const value = JSON.parse(match[1]!) as unknown;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function readInspectorClient(): Buffer {
  inspectorClientPath ??= packageRequire.resolve("@nudge-ui/inspector/client");
  return readFileSync(inspectorClientPath);
}


function scanCssFiles(
  rootDir: string,
  files: string[] = [],
  dir = rootDir,
  ignoredDirectory?: string,
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (
      entry === "node_modules"
      || entry === ".git"
      || entry === "build"
      || entry.startsWith("dist")
    ) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        if (ignoredDirectory && resolve(full) === ignoredDirectory) continue;
        scanCssFiles(rootDir, files, full, ignoredDirectory);
      }
      else if (CSS_EXT.test(entry)) files.push(full);
    } catch {
      // ignore unreadable entries
    }
  }
  return files;
}

function scanComponentFiles(rootDir: string, files: string[] = [], dir = rootDir): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith("dist")) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) scanComponentFiles(rootDir, files, full);
      else if (COMPONENT_EXT.test(entry)) files.push(full);
    } catch {
      // ignore unreadable entries
    }
  }
  return files;
}

function resolveReactAliases(projectRoot: string): Alias[] {
  const req = createRequire(projectRoot + "/package.json");
  const tryResolve = (spec: string): string | null => {
    try {
      return req.resolve(spec);
    } catch {
      return null;
    }
  };
  const aliases: Alias[] = [];
  const reactMain = tryResolve("react");
  if (reactMain) aliases.push({ find: /^react$/, replacement: reactMain });
  const reactDomMain = tryResolve("react-dom");
  if (reactDomMain) aliases.push({ find: /^react-dom$/, replacement: reactDomMain });
  const reactJsx = tryResolve("react/jsx-runtime");
  if (reactJsx) aliases.push({ find: /^react\/jsx-runtime$/, replacement: reactJsx });
  const reactJsxDev = tryResolve("react/jsx-dev-runtime");
  if (reactJsxDev) aliases.push({ find: /^react\/jsx-dev-runtime$/, replacement: reactJsxDev });
  const reactDomClient = tryResolve("react-dom/client");
  if (reactDomClient) aliases.push({ find: /^react-dom\/client$/, replacement: reactDomClient });
  return aliases;
}

function resolveInspectorComponentRuntime(): string | null {
  try {
    return packageRequire.resolve("@nudge-ui/inspector/component-runtime");
  } catch {
    return null;
  }
}

export interface TransformIndexHtmlOptions {
  /** Inject the debug mount div instead of the standard one. */
  debug?: boolean;
  /** Keep the injection in a `build` command (explicit demo builds only). */
  demoBuild?: boolean;
  /** Keep the route-sensitive landing demo on its build-time virtual module. */
  demo?: boolean;
}

export function transformIndexHtmlHtml(
  html: string,
  command: "serve" | "build",
  { debug = false, demoBuild = false, demo = false }: TransformIndexHtmlOptions = {},
): string | null {
  if (command === "build" && !demoBuild) return null;
  const script = demo || demoBuild ? LEGACY_INSPECTOR_SCRIPT : INSPECTOR_SCRIPT;
  const inject = `\n${debug ? DEBUG_MOUNT_DIV : MOUNT_DIV}\n${script}\n`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${inject}</body>`);
  }
  return html + inject;
}

function invalidateHmrModules(
  server: ViteDevServer,
  modules: readonly ModuleNode[],
  timestamp: number,
): void {
  const invalidated = new Set<ModuleNode>();
  for (const module of modules) {
    server.moduleGraph.invalidateModule(module, invalidated, timestamp, true);
  }
}

export function nudgeUi(options: NudgeUiOptions = {}): Plugin[] {
  const enabled = options.enabled ?? true;
  let root: string | undefined;
  let buildOutputDirectory: string | undefined;
  let command: "serve" | "build" = "serve";
  let demoBuild = false;
  let devServer: ViteDevServer | undefined;
  let postTransformPromise: Promise<void> | null = null;
  const inventory = createTokenInventory();
  const activeHostCssFiles = new Set<string>();
  // Ordering belongs to the stylesheet artifact, rather than to one particular
  // authored/transformed observation. A transform hook has no import-graph
  // ordering information of its own.
  const stylesheetOrdering = new Map<string, { order?: number; discoveryOrder?: number }>();
  // Tailwind v4 owns its naming contribution only when the authored graph
  // actually contains its v4 entrypoint. Tailwind v3 also emits --tw-* helper
  // variables, so transformed output alone is not a safe detector.
  const tailwindV4SourceFiles = new Set<string>();
  // Before Vite has built its module graph, these are the discovered host CSS
  // candidates that can supply a transformed first virtual-module snapshot.
  const discoveredHostCssFiles = new Set<string>();
  let activePackageCssFiles = new Set<string>();
  let publishedThemeContract: ThemeContract | null = null;
  let publishedThemeContractModuleId: string | null = null;
  let publishedThemeContractLoaded = false;
  let contractDiagnostics: TokenCatalogDiagnostic[] = [];
  let activeGraphDiagnostics: InventoryDiagnostic[] = [];
  const sourceScanDiagnostics = new Map<string, InventoryDiagnostic>();
  /** Generation of the last snapshot actually serialized into the virtual module. */
  let lastPublishedGeneration: string | null = null;
  const componentContracts = new Map<string, ComponentContract[]>();
  const manualComponentIds = new Set(options.componentMetadata?.map((contract) =>
    contract.componentId) ?? []);
  if (options.componentMetadata?.length) {
    componentContracts.set("package-manifests", options.componentMetadata.map((contract) => ({
      ...contract,
      provenance: "package-manifest",
    })));
  }
  const packageComponentModulesByFile = new Map<string, string[]>();
  const reportedComponentPolicyDiagnostics = new Set<string>();
  // The Adapter's own copy of the semantic runtime, used to alias the specifier
  // the compiler injects into instrumented callsites. A packed install cannot
  // resolve that specifier from the application's own dependency graph, so the
  // Adapter pins it once per plugin instance.
  const inspectorComponentRuntimePath = resolveInspectorComponentRuntime();
  let packageComponentFingerprint = "";
  const adapterRegistry = createTokenAdapterRegistry([
    ...(options.tailwindV3 ? [createTailwindV3Adapter(options.tailwindV3.config, options.tailwindV3.source)] : []),
    ...(options.vanillaExtract ? [createSprinklesAdapter(options.vanillaExtract)] : []),
  ]);

  /**
   * Resolve the source scope at hook time. Vite's final root and output
   * directory are not known when `nudgeUi()` is called, while every transform
   * and scan must use the same resolved scope.
   */
  function sourceScope(): ViteSourceScopeOptions {
    return {
      ...(options.sourceRoots ? { sourceRoots: options.sourceRoots } : {}),
      ...(buildOutputDirectory ? { generatedRoots: [buildOutputDirectory] } : {}),
    };
  }

  function isHostSource(id: string): boolean {
    return isHostApplicationSource(id, root, sourceScope());
  }

  function isPackageSource(id: string): boolean {
    return isPackageStylesheet(id, root, sourceScope());
  }

  function catalogPath(id: string): string {
    return catalogSourcePath(id, root, sourceScope());
  }

  function createStylesheetArtifact(
    input: Parameters<typeof createViteStylesheetArtifact>[0],
  ): ReturnType<typeof createViteStylesheetArtifact> {
    return createViteStylesheetArtifact({ ...input, ...sourceScope() });
  }

  function isGeneratedBuildOutput(id: string): boolean {
    if (!root || id.startsWith("\0")) return false;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    const absoluteFile = resolve(fileId);
    if (buildOutputDirectory && (
      absoluteFile === buildOutputDirectory
      || absoluteFile.startsWith(`${buildOutputDirectory}${sep}`)
    )) return true;
    const relativeFile = relative(root, absoluteFile);
    return relativeFile === "build" || relativeFile.startsWith(`build${sep}`);
  }

  /**
   * Feed one stylesheet observation to the token inventory. `id` is the Vite
   * module id (query stripped inside); the inventory row is keyed by the
   * normalized catalog source path so declaration `source` strings keep their
   * project/package-relative form.
   *
   * Authored and transformed observations for the SAME id are fed as two
   * artifacts (stage authored / stage transformed). The inventory keeps both
   * and reconciles them deterministically: the transformed observation is the
   * browser-relevant fact set, while names authored in the same artifact keep
   * project provenance. Tailwind v4 files are tagged `adapter: "tailwind-v4"`
   * at feed time (content-based, no hook-timing maps); the Tailwind v4 naming
   * contribution relabels the reconciled rows inside the inventory snapshot.
   */
  function feedCssArtifact(
    id: string,
    rawCode: string,
    stage: ArtifactStage,
    ordering: { order?: number; discoveryOrder?: number } = {},
  ): void {
    if (!CSS_EXT.test(id)) return;
    let code = rawCode;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    // Astro compiles component <style> blocks into JS wrapper modules keyed
    // by `.astro?...&lang.css` ids. No authored .css artifact exists for
    // them, so unwrap the embedded stylesheet string; otherwise the catalog
    // never sees component-scoped custom properties (ADR-0011). Plain .css
    // modules keep their authored observation and are untouched.
    if (!CSS_EXT.test(fileId)) {
      const unwrapped = extractViteModuleCss(code);
      if (unwrapped !== null) code = unwrapped;
    }
    if (isGeneratedBuildOutput(fileId)) return;
    if (ordering.order !== undefined || ordering.discoveryOrder !== undefined) {
      stylesheetOrdering.set(fileId, { ...ordering });
    }
    if (stage === "authored") {
      if (/@import\s+["']tailwindcss["']|@theme\b/i.test(code)) tailwindV4SourceFiles.add(fileId);
      else tailwindV4SourceFiles.delete(fileId);
    }
    const artifact = createStylesheetArtifact({
      id: fileId,
      projectRoot: root,
      stage,
      ...(stylesheetOrdering.get(fileId) ?? ordering),
      content: code,
      tailwindV4: tailwindV4SourceFiles.has(fileId),
    });
    inventory.apply(artifact);
    sourceScanDiagnostics.delete(artifact.id);
  }

  /** Drop every observation and temporary provenance fact for one stylesheet. */
  function feedCssRemoval(id: string): void {
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    tailwindV4SourceFiles.delete(fileId);
    stylesheetOrdering.delete(fileId);
    discoveredHostCssFiles.delete(fileId);
    const artifact = createStylesheetArtifact({
      id: fileId,
      projectRoot: root,
      stage: "authored",
    });
    sourceScanDiagnostics.delete(artifact.id);
    inventory.apply(artifact);
  }

  /**
   * Report a failed or unavailable transform for one stylesheet. The inventory
   * retains the last valid authored observation for the id and records a
   * recoverable `transform-observation-failed` diagnostic instead of dropping
   * rows (see `StylesheetArtifact.failed`).
   */
  function feedCssTransformFailure(id: string): void {
    if (!CSS_EXT.test(id)) return;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    if (isGeneratedBuildOutput(fileId)) return;
    inventory.apply(createStylesheetArtifact({
      id: fileId,
      projectRoot: root,
      stage: "transformed",
      failed: true,
    }));
  }
  function refreshPackageComponentContracts(): void {
    const hostByModule = new Map<string, string>();
    for (const [hostFile, modules] of [...packageComponentModulesByFile].sort(([left], [right]) =>
      left.localeCompare(right))) {
      for (const moduleSpecifier of modules) {
        if (!hostByModule.has(moduleSpecifier)) {
          hostByModule.set(moduleSpecifier, hostFile);
        }
      }
    }
    const fingerprint = [...hostByModule]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([moduleSpecifier, hostFile]) => `${moduleSpecifier}\0${hostFile}`)
      .join("\n");
    if (fingerprint === packageComponentFingerprint) return;

    for (const key of [...componentContracts.keys()]) {
      if (key.startsWith("package-types:")) componentContracts.delete(key);
    }
    const packageCatalog = root
      ? extractPackageComponentContractCatalog({
          hostFile: join(root, "__nudge_ui_package_contracts__.tsx"),
          moduleSpecifiers: [...hostByModule.keys()],
        })
      : [];
    for (const moduleSpecifier of hostByModule.keys()) {
      componentContracts.set(
        `package-types:${moduleSpecifier}`,
        packageCatalog.filter((contract) =>
          contract.file === moduleSpecifier && !manualComponentIds.has(contract.componentId)),
      );
    }
    packageComponentFingerprint = fingerprint;
  }

  function cacheComponentsForFile(id: string, code: string, refreshPackages = true): void {
    if (!COMPONENT_EXT.test(id) || !isHostSource(id)) return;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    const rel = catalogPath(fileId);
    componentContracts.set(fileId, extractComponentContracts(code, rel));
    packageComponentModulesByFile.set(fileId, collectPackageComponentModules(code, fileId));
    if (refreshPackages) refreshPackageComponentContracts();
  }

  async function refreshPublishedThemeContract(): Promise<void> {
    const moduleSpecifier = options.vanillaExtract?.themeContractModule;
    if (!moduleSpecifier || !devServer) return;
    const exportName = options.vanillaExtract?.themeContractExport ?? "vars";
    publishedThemeContract = null;
    publishedThemeContractModuleId = null;
    contractDiagnostics = [];

    let resolvedId: string | null = null;
    try {
      resolvedId = (await devServer.pluginContainer.resolveId(moduleSpecifier))?.id ?? null;
    } catch {
      // A diagnostic below gives consumers a stable explanation without making
      // the ordinary CSS catalog unavailable.
    }
    if (!resolvedId) {
      contractDiagnostics = [{
        code: "vanilla-extract-contract-unresolved",
        module: moduleSpecifier,
        message: `Could not resolve vanilla-extract contract module ${moduleSpecifier}.`,
      }];
      publishedThemeContractLoaded = true;
      return;
    }
    // Retain the resolved id even for an invalid export so a later HMR update
    // can recover from a package publishing the contract after startup.
    publishedThemeContractModuleId = stripCssQuery(resolvedId);

    let namespace: Awaited<ReturnType<ViteDevServer["ssrLoadModule"]>>;
    try {
      namespace = await devServer.ssrLoadModule(resolvedId);
    } catch {
      contractDiagnostics = [{
        code: "vanilla-extract-contract-unresolved",
        module: moduleSpecifier,
        message: `Could not load vanilla-extract contract module ${moduleSpecifier}.`,
      }];
      publishedThemeContractLoaded = true;
      return;
    }
    const exported = namespace[exportName];
    if (exported === undefined) {
      contractDiagnostics = [{
        code: "vanilla-extract-contract-missing-export",
        module: moduleSpecifier,
        exportName,
        message: `Vanilla-extract contract module ${moduleSpecifier} does not export ${exportName}.`,
      }];
    } else if (!isRecord(exported)) {
      contractDiagnostics = [{
        code: "vanilla-extract-contract-unsupported-shape",
        module: moduleSpecifier,
        exportName,
        message: `Vanilla-extract contract export ${exportName} from ${moduleSpecifier} must be an object.`,
      }];
    } else {
      publishedThemeContract = exported;
    }
    publishedThemeContractLoaded = true;
  }

  async function ensurePublishedThemeContract(): Promise<void> {
    if (!options.vanillaExtract?.themeContractModule || publishedThemeContractLoaded) return;
    await refreshPublishedThemeContract();
  }

  function publishedThemeContractContribution() {
    return createPublishedVanillaExtractContribution({
      moduleSpecifier: options.vanillaExtract?.themeContractModule,
      loaded: publishedThemeContractLoaded,
      contract: publishedThemeContract,
      diagnostics: contractDiagnostics,
      resolvedModuleId: publishedThemeContractModuleId,
      projectRoot: root,
      prefix: options.vanillaExtract?.themeContractPrefix,
      source: options.vanillaExtract?.source,
    });
  }

  /**
   * Merge every styling-Adapter contribution INSIDE the inventory so the
   * snapshot already carries the final adapter/origin/editable labels: literal
   * tokens (Tailwind v3 config, Sprinkles), Tailwind v4 relabellings, and the
   * published vanilla-extract theme-contract
   * enrichment as id-keyed contributions. Every call is idempotent (identical
   * facts are no-ops), so load() and the HMR exactly-once guard share one path.
   */
  function syncInventoryContributions(): void {
    inventory.applyContribution(adapterRegistry.toInventoryContribution([
      ...sourceScanDiagnostics.values(),
      ...activeGraphDiagnostics,
    ]));
    if (tailwindV4SourceFiles.size > 0) {
      inventory.applyContribution(createTailwindV4NamingContribution());
    } else {
      inventory.applyContribution({ id: "tailwind-v4-naming", order: 0 });
    }
    inventory.applyContribution(publishedThemeContractContribution());
  }

  /**
   * Publish the virtual token module exactly once per observable snapshot
   * change. All HMR feeds for one event settle before this is called, so the
   * snapshot reflects the final facts; a no-op follow-up (identical facts) does
   * not bump the generation again. Contributions are synced first so the guard
   * compares against the same facts load() would serialize (idempotent).
   */
  function invalidateTokensIfChanged(server: ViteDevServer) {
    const generation = currentTokenGeneration();
    if (generation === lastPublishedGeneration) return { changed: false, generation };
    lastPublishedGeneration = generation;
    const virtual = server.moduleGraph.getModuleById(RESOLVED_TOKENS_ID);
    if (virtual) server.moduleGraph.invalidateModule(virtual);
    return virtual ? { changed: true, generation, virtual } : { changed: true, generation };
  }

  function currentTokenGeneration(): string {
    syncInventoryContributions();
    return inventory.snapshot().generation;
  }

  async function handleStylesheetWatchEvent(
    server: ViteDevServer,
    file: string,
    event: "add" | "unlink",
  ): Promise<void> {
    if (!enabled || command !== "serve" || !CSS_EXT.test(file)) return;
    const previousGeneration = currentTokenGeneration();
    postTransformPromise = null;

    if (event === "unlink") {
      server.moduleGraph.onFileDelete(file);
      activeHostCssFiles.delete(stripCssQuery(file));
      feedCssRemoval(file);
    } else {
      // Project CSS participates in the source inventory even before import;
      // package CSS is admitted only by the active graph refresh below.
      if (isHostSource(file)) {
        try {
          feedCssArtifact(file, readFileSync(file, "utf8"), "authored");
        } catch {
          const source = catalogPath(file);
          sourceScanDiagnostics.set(source, {
            code: "stylesheet-unreadable",
            artifact: source,
            message: `Could not read stylesheet ${source}.`,
          });
        }
      }
    }

    await refreshActiveStylesheetTokens();
    if (event === "add" && activeHostCssFiles.has(stripCssQuery(file))) {
      try {
        await server.transformRequest(file);
      } catch {
        if (existsSync(file)) feedCssTransformFailure(file);
      }
    }

    const { generation } = invalidateTokensIfChanged(server);
    if (generation !== previousGeneration) {
      server.ws.send({ type: "full-reload", path: "*" });
    }
  }

  async function refreshActiveStylesheetTokens(): Promise<void> {
    if (!devServer || !root) return;
    const graphModules = devServer.moduleGraph?.idToModuleMap;
    if (graphModules) {
      activeHostCssFiles.clear();
      for (const module of graphModules.values()) {
        const id = module.id && stripCssQuery(module.id);
        if (id && CSS_EXT.test(id) && isHostSource(id)
          && module.importers.size > 0) activeHostCssFiles.add(id);
      }
    }
    const graph = await discoverCssImportGraph([...activeHostCssFiles], {
      read: (id) => readFileSync(id, "utf8"),
      resolve: async (specifier, importer) => {
        const resolved = await devServer!.pluginContainer.resolveId(specifier, importer);
        if (resolved?.id) return resolved.id;
        try {
          return createRequire(importer).resolve(specifier);
        } catch {
          return null;
        }
      },
    });
    const nextPackageFiles = new Set<string>();
    for (const { id, code, ...ordering } of orderViteStylesheetGraph(
      graph,
      activeHostCssFiles.size,
    )) {
      const fileId = stripCssQuery(id);
      feedCssArtifact(fileId, code, "authored", ordering);
      if (isPackageSource(fileId)) nextPackageFiles.add(fileId);
    }
    for (const previous of activePackageCssFiles) {
      if (!nextPackageFiles.has(previous)) feedCssRemoval(previous);
    }
    activeGraphDiagnostics = [
      ...graph.unreadable.map((id): InventoryDiagnostic => ({
        code: "stylesheet-unreadable",
        artifact: catalogPath(id),
        message: `Could not read stylesheet ${catalogPath(id)}.`,
      })),
      ...graph.unresolved.map(({ importer, specifier }): InventoryDiagnostic => ({
        code: "stylesheet-unresolved",
        artifact: catalogPath(importer),
        module: specifier,
        message: `Could not resolve stylesheet import ${specifier} from ${catalogPath(importer)}.`,
      })),
    ];
    activePackageCssFiles = nextPackageFiles;
  }

  function ensurePostTransformCss(): Promise<void> {
    if (!devServer || !root || command !== "serve") return Promise.resolve();
    if (postTransformPromise) return postTransformPromise;

    // The Vite module graph is the source of truth for reachable stylesheet
    // entries. Asking Vite to transform only those entries drives them through
    // the companion observer plugin below without activating dead CSS files.
    postTransformPromise = (async () => {
      await refreshActiveStylesheetTokens();
      const cssPaths = activeHostCssFiles.size > 0
        ? activeHostCssFiles
        : discoveredHostCssFiles;
      await Promise.all([...cssPaths].map(async (cssPath) => {
        try {
          await devServer!.transformRequest(cssPath);
        } catch {
          if (existsSync(cssPath)) feedCssTransformFailure(cssPath);
        }
      }));
    })();
    return postTransformPromise;
  }

  async function buildClientManifest(): Promise<NudgeUiClientManifest> {
    await ensurePostTransformCss();
    await ensurePublishedThemeContract();
    return {
      version: 1,
      revision: 0,
      runtime: buildRuntimeSnapshot(),
    };
  }

  function buildRuntimeSnapshot(): NudgeUiRuntimeConfig {
    syncInventoryContributions();
    const snapshot = inventory.snapshot();
    const tokenDiagnostics: TokenCatalogDiagnostic[] = snapshot.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      module: diagnostic.module ?? diagnostic.artifact ?? "token-inventory",
      ...(diagnostic.exportName !== undefined ? { exportName: diagnostic.exportName } : {}),
    }));
    return {
      projectId: options.projectId ?? (root ? basename(root) : "vite"),
      host: "vite-react",
      framework: "React",
      stylingSystem: detectStylingSystem(snapshot.tokens),
      capabilities: { canvas: true, componentSemantics: true },
      tokenCatalog: snapshot.definitions.map((definition) => ({
        ...definition,
        declarations: definition.declarations.map((declaration) => ({ ...declaration })),
      })),
      tokens: snapshot.tokens,
      tokenDiagnostics,
      tokenGeneration: snapshot.generation,
      componentContracts: componentContractCatalog(),
    };
  }

  function componentContractCatalog(): ComponentContract[] {
    return [...componentContracts.values()].flat();
  }

  const plugin: Plugin = {
    name: "nudge-ui",
    enforce: "pre",
    config(userConfig, env) {
      if (!enabled || env.command !== "serve") return;
      const projectRoot = userConfig.root ?? process.cwd();
      const demoAliases = options.demo === true && !options.skipReactAliases
        ? resolveReactAliases(projectRoot)
        : [];
      const existingDedupe = userConfig.resolve?.dedupe ?? [];
      const runtimeAliases: Alias[] = inspectorComponentRuntimePath
        ? [{ find: "@nudge-ui/inspector/component-runtime", replacement: inspectorComponentRuntimePath }]
        : [];
      return {
        resolve: {
          ...(demoAliases.length > 0 || runtimeAliases.length > 0
            ? { alias: [...demoAliases, ...runtimeAliases] }
            : {}),
          // The published inspector client is self-contained, while the
          // transformed callsites must use the host application's React.
          // Dedupe prevents a workspace-linked or nested React copy from
          // creating a second runtime without aliasing normal applications.
          dedupe: [...new Set([...existingDedupe, "react", "react-dom"])],
        },
      };
    },
    configResolved(config: ResolvedConfig) {
      root = config.root;
      command = config.command;
      demoBuild = options.demo === true && config.mode === "nudge-demo";
      buildOutputDirectory = config.build?.outDir
        ? resolve(config.root, config.build.outDir)
        : undefined;
    },
    configureServer(server) {
      if (!enabled || command !== "serve") return;
      devServer = server;
      if (!inspectorComponentRuntimePath) {
        // Not fatal: a host that depends on @nudge-ui/inspector directly can
        // still resolve the injected specifier itself. Packed installs that do
        // not will fail at the importing module, so say so before that happens.
        server.config.logger.warn(
          "[nudge-ui] Could not resolve @nudge-ui/inspector/component-runtime from the "
            + "Vite adapter. Semantic component callsites will fall back to application "
            + "resolution of that specifier.",
        );
      }
      server.middlewares?.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://nudge-ui.local").pathname;
        if ((pathname === CLIENT_PATH || pathname === MANIFEST_PATH) && request.method !== "GET") {
          response.statusCode = 405;
          response.end();
          return;
        }
        if (pathname === CLIENT_PATH) {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.setHeader("Cache-Control", "no-cache");
            response.end(readInspectorClient());
          } catch {
            response.statusCode = 503;
            response.end("Nudge UI client has not been built.");
          }
          return;
        }
        if (pathname === MANIFEST_PATH) {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(await buildClientManifest()));
          } catch (error) {
            next(error);
          }
          return;
        }
        next();
      });
      server.watcher?.on("add", (file) => handleStylesheetWatchEvent(server, file, "add"));
      server.watcher?.on("unlink", (file) => handleStylesheetWatchEvent(server, file, "unlink"));
    },
    buildStart() {
      // Eager scan so the token table is populated before the virtual module
      // is first loaded. The browser imports App -> virtual:design-tokens
      // before styles.css is necessarily transformed, so transform-only
      // collection would yield an empty first load.
      if (!enabled || (command !== "serve" && !demoBuild) || !root) return;
      for (const cssPath of scanCssFiles(root, [], root, buildOutputDirectory)) {
        try {
          const code = readFileSync(cssPath, "utf8");
          if (isHostSource(cssPath)) discoveredHostCssFiles.add(cssPath);
          feedCssArtifact(cssPath, code, "authored");
        } catch {
          const rel = catalogPath(cssPath);
          sourceScanDiagnostics.set(rel, {
            code: "stylesheet-unreadable",
            artifact: rel,
            message: `Could not read stylesheet ${rel}.`,
          });
        }
      }
      for (const componentPath of scanComponentFiles(root)) {
        try {
          cacheComponentsForFile(componentPath, readFileSync(componentPath, "utf8"), false);
        } catch {
          // skip unreadable component sources
        }
      }
      refreshPackageComponentContracts();
    },
    resolveId(id) {
      if (id === VIRTUAL_TOKENS_ID || id === RESOLVED_TOKENS_ID) return RESOLVED_TOKENS_ID;
      if (id === VIRTUAL_INSPECTOR_ID || id === RESOLVED_INSPECTOR_ID) return RESOLVED_INSPECTOR_ID;
      if (id === VIRTUAL_COMPONENTS_ID || id === RESOLVED_COMPONENTS_ID) return RESOLVED_COMPONENTS_ID;
      return null;
    },
    async load(id) {
      if (id === RESOLVED_TOKENS_ID) {
        // ADR-0002: production builds receive an empty token table.
        if (command === "build" && !demoBuild) {
          return `export const tokenCatalog = [];\nexport const tokens = [];\nexport const tokenDiagnostics = [];\nexport const tokenGeneration = "";\nexport const nudgeUiProjectId = "";\nexport default tokens;\n`;
        }
        await ensurePostTransformCss();
        await ensurePublishedThemeContract();
        // Styling contributions merge INSIDE the inventory (see
        // `syncInventoryContributions`). load() takes ONE immutable snapshot
        // and serializes it verbatim — there is no post-snapshot enrichment and
        // no TOCTOU between the snapshot call and serialization.
        const runtime = buildRuntimeSnapshot();
        lastPublishedGeneration = runtime.tokenGeneration;
        return `export const tokenCatalog = ${JSON.stringify(runtime.tokenCatalog)};\nexport const tokens = ${JSON.stringify(runtime.tokens)};\nexport const tokenDiagnostics = ${JSON.stringify(runtime.tokenDiagnostics)};\nexport const tokenGeneration = ${JSON.stringify(runtime.tokenGeneration)};\nexport const nudgeUiProjectId = ${JSON.stringify(runtime.projectId)};\nexport default tokens;\n`;
      }
      if (id === RESOLVED_INSPECTOR_ID) {
        // ADR-0002: normal production builds receive no inspector bootstrap.
        if (command === "build" && !demoBuild) {
          return `export {};\n`;
        }
        if (options.demo === true) {
          const landingDemoExpression = demoBuild
            ? "true"
            : '(import.meta.env.DEV && window.location.pathname === "/")';
          return [
            'import { bootstrapNudgeUi, configureNudgeUiRuntime, detectFramework, setInspectorOpen } from "@nudge-ui/inspector";',
            'import { tokenCatalog, tokens, tokenDiagnostics, tokenGeneration, nudgeUiProjectId } from "virtual:design-tokens";',
            'import { componentContracts } from "virtual:nudge-ui-components";',
            'const __nudge_ui_demo_frame = new URLSearchParams(window.location.search).get("nudgeDemo") === "1";',
            `const __nudge_ui_landing_demo = ${landingDemoExpression};`,
            'const __nudge_ui_demo_runtime = __nudge_ui_demo_frame || __nudge_ui_landing_demo;',
            'if (__nudge_ui_demo_runtime || (import.meta.env.DEV && window.location.pathname !== "/demo")) {',
            '  configureNudgeUiRuntime({',
            '    projectId: nudgeUiProjectId,',
            '    host: "vite-react",',
            '    framework: "React",',
            '    stylingSystem: detectFramework(tokens).stylingSystem,',
            '    ...(__nudge_ui_demo_runtime ? { demo: true } : {}),',
            '    capabilities: { canvas: __nudge_ui_demo_runtime ? false : true, componentSemantics: true },',
            '    tokenCatalog,',
            '    tokens,',
            '    tokenDiagnostics,',
            '    tokenGeneration,',
            '    componentContracts,',
            '  });',
            '  const __dt_root = document.getElementById("nudge-ui-root");',
            '  if (__dt_root) {',
            '    bootstrapNudgeUi(__dt_root);',
            '    if (__nudge_ui_demo_runtime) {',
            '      setInspectorOpen(false);',
            '      window.addEventListener("nudge-ui:open", () => setInspectorOpen(true));',
            '    }',
            '  }',
            '}',
          ].join("\n");
        }
        return null;
      }
      if (id === RESOLVED_COMPONENTS_ID) {
        if (command === "build" && !demoBuild) return "export const componentContracts = [];\nexport default componentContracts;\n";
        const catalog = componentContractCatalog();
        return `export const componentContracts = ${JSON.stringify(catalog)};\nexport default componentContracts;\n`;
      }
      return null;
    },
    // React's Vite plugin is also an `enforce: "pre"` plugin. Its transform
    // hook is declared without an explicit order, so use Vite's hook-level
    // `order: "pre"` to ensure we parse the authored TSX before React/Babel
    // prepends refresh helpers and shifts the AST locations used by data-src.
    transform: {
      order: "pre",
      async handler(code, id) {
        if (!enabled) return null;
        if (command === "build" && !demoBuild) return null; // dev-only per ADR-0002; explicit demo builds are opt-in
        if (CSS_EXT.test(id)) {
          const fileId = stripCssQuery(id);
          if (isHostSource(fileId)) {
            activeHostCssFiles.add(fileId);
            discoveredHostCssFiles.add(fileId);
          }
          feedCssArtifact(id, code, "authored");
          return null; // let Vite's CSS pipeline handle the actual stylesheet
        }
        const instrumentComponents = isHostSource(id);
        const isComponentModule = COMPONENT_EXT.test(id);
        if (isComponentModule && instrumentComponents) {
          cacheComponentsForFile(id, code);
        }
        const hostPolicy = isComponentModule && instrumentComponents
          ? await resolveHostComponentPolicy(code, id, {
              resolve: async (specifier, importer) => {
                const resolved = await this.resolve(specifier, importer, { skipSelf: true });
                return resolved ? stripCssQuery(resolved.id) : null;
              },
              read: async (resolvedId) => {
                try {
                  return readFileSync(resolvedId, "utf8");
                } catch {
                  return null;
                }
              },
              isProjectSource: isHostSource,
              sourcePath: catalogPath,
            }, {
              moduleProtocols: mergeComponentModuleProtocols(
                defaultReactComponentProtocols,
                options.componentProtocols,
              ),
              compatibleComponentImports: options.compatibleComponentImports,
            })
          : undefined;
        for (const grouped of groupComponentPolicyDiagnostics(hostPolicy?.diagnostics ?? [])) {
          if (reportedComponentPolicyDiagnostics.has(grouped.key)) continue;
          reportedComponentPolicyDiagnostics.add(grouped.key);
          this.warn(formatComponentPolicyWarning(grouped, catalogPath(id)));
        }
        return injectIdentity(code, id, root, {
          // Runtime component boundaries belong to host application callsites.
          // Workspace packages are included only when sourceRoots declares
          // them. Inspector and generated sources remain outside host scope.
          instrumentComponents,
          // The resolved policy already folds compatibleComponentImports in, so
          // identity reads one policy rather than two possible sources of truth.
          hostPolicy,
        });
      },
    },
    transformIndexHtml(html) {
      // The standalone landing app uses the normal HTML injection during
      // development. Its static demo build imports the virtual module from
      // the app entry instead, because Vite cannot preserve the development
      // HTML virtual-module URL in a static build.
      if (!enabled || demoBuild) return;
      const out = transformIndexHtmlHtml(html, command, {
        debug: options.debug === true,
        demoBuild,
        demo: options.demo === true,
      });
      return out === null ? undefined : out;
    },
    async handleHotUpdate(ctx) {
      if (!enabled || command !== "serve") return;
      if (publishedThemeContractModuleId && stripCssQuery(ctx.file) === publishedThemeContractModuleId) {
        const previousGeneration = currentTokenGeneration();
        invalidateHmrModules(ctx.server, ctx.modules, ctx.timestamp);
        publishedThemeContractLoaded = false;
        await ensurePublishedThemeContract();
        // Same exactly-once path as the CSS branch: invalidate the virtual
        // module only when the refreshed contract changed the snapshot.
        const { changed, generation, virtual } = invalidateTokensIfChanged(ctx.server);
        if (changed && virtual) return [...ctx.modules, virtual];
        if (generation !== previousGeneration) {
          ctx.server.ws.send({ type: "full-reload", path: "*" });
        }
        return;
      }
      if (COMPONENT_EXT.test(ctx.file)) {
        const previousGeneration = currentTokenGeneration();
        const previousContracts = JSON.stringify(componentContractCatalog());
        try {
          cacheComponentsForFile(ctx.file, await ctx.read());
        } catch {
          componentContracts.set(ctx.file, []);
          packageComponentModulesByFile.delete(ctx.file);
          refreshPackageComponentContracts();
        }
        // Re-transform the changed module so Vite updates its importer edges
        // before package-CSS reachability is rebuilt. A component can add or
        // remove a stylesheet import while every CSS file remains on disk.
        invalidateHmrModules(ctx.server, ctx.modules, ctx.timestamp);
        try {
          await ctx.server.transformRequest(ctx.file);
        } catch {
          // Component metadata still refreshes; the next successful transform
          // will rebuild the active stylesheet roots.
        }
        postTransformPromise = null;
        await ensurePostTransformCss();

        const virtualComponents = ctx.server.moduleGraph.getModuleById(RESOLVED_COMPONENTS_ID);
        const { changed, generation, virtual: virtualTokens } = invalidateTokensIfChanged(ctx.server);
        const contractsChanged = JSON.stringify(componentContractCatalog()) !== previousContracts;
        const modules = [...ctx.modules];
        if (contractsChanged && virtualComponents) {
          ctx.server.moduleGraph.invalidateModule(virtualComponents);
          modules.push(virtualComponents);
        }
        if (changed && virtualTokens) {
          modules.push(virtualTokens);
        }
        const tokensChanged = generation !== previousGeneration;
        if ((contractsChanged && !virtualComponents) || (tokensChanged && !virtualTokens)) {
          ctx.server.ws.send({ type: "full-reload", path: "*" });
        }
        return modules.length > 0 ? [...new Set(modules)] : undefined;
      }
      if (!CSS_EXT.test(ctx.file)) return;
      const previousGeneration = currentTokenGeneration();

      // Refresh the token inventory immediately so the next virtual-module load
      // sees the updated tokens (Vite's own CSS reload happens in parallel).
      let hasAuthoredObservation = false;
      try {
        const code = await ctx.read();
        hasAuthoredObservation = true;
        feedCssArtifact(ctx.file, code, "authored");
      } catch {
        const fileId = stripCssQuery(ctx.file);
        if (!existsSync(fileId)) {
          feedCssRemoval(ctx.file);
        } else {
          const rel = catalogPath(fileId);
          sourceScanDiagnostics.set(rel, {
            code: "stylesheet-unreadable",
            artifact: rel,
            message: `Could not read stylesheet ${rel}. Keeping its last valid token inventory entry.`,
          });
        }
      }

      await refreshActiveStylesheetTokens();

      // ctx.read() returns authored source. Re-run the CSS through Vite so the
      // transform hook can replace that snapshot with Tailwind's generated
      // stylesheet before the virtual module is invalidated below.
      postTransformPromise = null;
      try {
        await ctx.server.transformRequest(ctx.file);
      } catch {
        // Keep the authored snapshot if the post-transform request fails: feed
        // a failed-transform marker so the inventory retains the authored rows
        // plus a recoverable diagnostic. A deleted file (no authored read) is a
        // removal, not a transform failure.
        if (hasAuthoredObservation) feedCssTransformFailure(ctx.file);
      }

      // Exactly-once publish: with every feed for this event settled, invalidate
      // the virtual module only when the snapshot generation actually changed.
      // A no-op follow-up (identical facts) is a no-op here too, while Vite's
      // own CSS update below still refreshes the edited stylesheet visually.
      const { changed, generation, virtual } = invalidateTokensIfChanged(ctx.server);
      if (generation !== previousGeneration && !virtual) {
        ctx.server.ws.send({ type: "full-reload", path: "*" });
      }
      const modules: NonNullable<ReturnType<typeof ctx.server.moduleGraph.getModuleById>>[] = [];
      if (changed && virtual) modules.push(virtual);
      for (const m of ctx.modules) {
        if (m) modules.push(m);
      }
      // Deduplicate while preserving order.
      const seen = new Set<string>();
      return modules.filter((m) => {
        if (seen.has(m.id ?? "")) return false;
        seen.add(m.id ?? m.url);
        return true;
      });
    },
  };

  // Tailwind's generator is a pre-transform hook. This companion stays in
  // Vite's normal group, which places it after every pre plugin regardless of
  // user configuration order and before Vite's CSS-post JavaScript wrapper.
  // The main plugin above remains pre-ordered for TSX source locations.
  const transformedCssObserver: Plugin = {
    name: "nudge-ui:transformed-css",
    apply: "serve",
    transform(code, id) {
      if (!enabled || command !== "serve" || !CSS_EXT.test(id)) return null;
      feedCssArtifact(id, code, "transformed");
      const virtual = devServer?.moduleGraph.getModuleById(RESOLVED_TOKENS_ID);
      if (virtual) devServer?.moduleGraph.invalidateModule(virtual);
      return null;
    },
  };

  return [plugin, transformedCssObserver];
}

export { injectIdentity, injectDataCid } from "./transform/injectDataCid.ts";
export type { InjectResult } from "./transform/injectDataCid.ts";
export { isHostApplicationSource } from "./tokens/viteStylesheetArtifacts.ts";
export type { TokenContext, TokenDeclaration, TokenDefinition, TokenEntry } from "./virtual/design-tokens.ts";
export { createTailwindV4Adapter, createTailwindV4NamingContribution, detectTailwindV4, entriesFromTailwindV4Catalog, mapTailwindV4ColorOpacity, tailwindV4ColorExpression } from "./adapters/tailwindV4.ts";
export type { TailwindAlphaMapping } from "./adapters/tailwindV4.ts";
export { createTailwindV3Adapter, detectTailwindV3Config, extractTailwindV3Tokens, resolveTailwindV3ClassName, tailwindV3ColorDeclaration } from "./adapters/tailwindV3.ts";
export type { TailwindV3Config, TailwindV3Mapping } from "./adapters/tailwindV3.ts";
export { createTokenAdapterRegistry } from "./adapters/registry.ts";
export { createSprinklesAdapter, createVanillaExtractAdapter, extractVanillaExtractTokens, resolveSprinklesClassName } from "./adapters/vanillaExtract.ts";
export type { TokenAdapter, TokenMapping } from "./adapters/types.ts";
export type { ThemeContract, SprinklesClassMap, VanillaExtractAdapterOptions } from "./adapters/vanillaExtract.ts";
export { materializeVanillaExtractContract, mergeVanillaExtractContract } from "./adapters/vanillaExtractRuntime.ts";
export type { MaterializedTokenCatalog, MaterializeVanillaExtractOptions } from "./adapters/vanillaExtractRuntime.ts";
export { materializeVanillaExtractContribution } from "./adapters/vanillaExtractContract.ts";
export type { MaterializeVanillaExtractContractOptions } from "./adapters/vanillaExtractContract.ts";
