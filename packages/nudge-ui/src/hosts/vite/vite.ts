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
} from "../../css/token-inventory/index.ts";
import {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  createNudgeUiEditorDocument,
  isNudgeUiEditorDocumentRequest,
} from "../../transport/index.ts";
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
import { interpretDialects } from "../../css/dialects/index.ts";
import type { TailwindV3Config, ThemeContract } from "../../css/dialects/index.ts";
import type { ComponentContract } from "../../compiler/index.ts";
import {
  detectStylingSystem,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "../../inspector/clientManifest.ts";
import type { FrameworkHost, FrameworkSupport, ReactOptions } from "./react.ts";
import {
  loopbackOrigin,
  startOptionalProjectBridge,
  type ProjectBridgeBrowserConfig,
} from "../projectBridge.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * How to find the project's vanilla-extract theme contract. Loading a module
 * is a host capability, so the specifier lives here; what the contract means
 * is interpreted in `nudge-ui/css/dialects`.
 */
export interface VanillaExtractOptions {
  themeContract?: ThemeContract;
  /** A Vite-resolvable module exporting a published compiled contract. */
  themeContractModule?: string;
  /** Defaults to `vars`. */
  themeContractExport?: string;
  themeContractPrefix?: string;
  /** Known compiled values by custom-property name. */
  cssValues?: Readonly<Record<string, string>>;
  source?: string;
}

export interface NudgeUiOptions extends ReactOptions {
  enabled?: boolean;
  /** Enables experimental DOM parent/child navigation in the Inspector. */
  debug?: boolean;
  /** Enables the landing app's restricted, iframe-backed demo runtime. */
  demo?: boolean;
  /** Additional same-origin routes shown when the public demo opens. */
  demoPages?: readonly string[];
  /** Labels for the seeded demo cards in display order, including the primary card. */
  demoCardLabels?: readonly string[];
  /** Explicit project ID for browser-storage keys (defaults to root directory basename). */
  projectId?: string;
  /** Optional static v3 config for fixture/app integrations; dynamic configs are not executed. */
  tailwindV3?: { config: TailwindV3Config; source?: string };
  vanillaExtract?: VanillaExtractOptions;
  /**
   * Authored workspace directories outside Vite's resolved root. Dependencies
   * and generated output stay excluded even when a broad directory is given.
   */
  sourceRoots?: readonly string[];
}

const VIRTUAL_TOKENS_ID = "virtual:design-tokens";
const RESOLVED_TOKENS_ID = "\0" + VIRTUAL_TOKENS_ID;
const VIRTUAL_INSPECTOR_ID = "virtual:nudge-ui-inspector";
const RESOLVED_INSPECTOR_ID = "\0" + VIRTUAL_INSPECTOR_ID;
const CSS_EXT = /\.css(?:$|[?#])/;
const CLIENT_PATH = NUDGE_UI_CLIENT_PATH;
const MANIFEST_PATH = NUDGE_UI_MANIFEST_PATH;
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
  inspectorClientPath ??= packageRequire.resolve("nudge-ui/internal/client");
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

/**
 * Owns the build tool and nothing else: module graph, CSS observation, token
 * inventory, transport middleware, bootstrap injection, HMR. Framework
 * semantics arrive through `createFramework`; passing `null` is a supported
 * composition, and `vite.noFramework.test.ts` exercises it to prove nothing
 * here has grown a React assumption.
 */
export function createVitePlugins(
  options: NudgeUiOptions = {},
  createFramework: ((options: NudgeUiOptions, host: FrameworkHost) => FrameworkSupport) | null = null,
): Plugin[] {
  const enabled = options.enabled ?? true;
  let root: string | undefined;
  let buildOutputDirectory: string | undefined;
  let command: "serve" | "build" = "serve";
  let demoBuild = false;
  let devServer: ViteDevServer | undefined;
  let projectBridge: { browser: ProjectBridgeBrowserConfig; close(): Promise<void> } | null = null;
  let projectBridgeStart: Promise<void> | null = null;
  let postTransformPromise: Promise<void> | null = null;
  const inventory = createTokenInventory();
  const activeHostCssFiles = new Set<string>();
  // Belongs to the artifact, not one observation: a transform hook has no import-graph ordering.
  const stylesheetOrdering = new Map<string, { order?: number; discoveryOrder?: number }>();
  // Detected from the authored graph: v3 also emits --tw-* helpers, so transformed output is not a safe signal.
  const tailwindV4SourceFiles = new Set<string>();
  // Candidates that can supply a transformed first snapshot before Vite builds its module graph.
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

  /** Resolved at hook time: Vite's root and output directory are unknown when `nudgeUi()` is called. */
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

  // Everything below reaches the framework through optional chaining, so `null` is a working configuration.
  const frameworkModuleId = (id: string): boolean =>
    framework !== null && (id === framework.virtualModuleId || id === resolvedFrameworkModule());
  const resolvedFrameworkModule = (): string | null =>
    framework === null ? null : `\0${framework.virtualModuleId}`;

  const framework = createFramework?.(options, {
    root: () => root,
    isHostSource,
    catalogPath,
  }) ?? null;

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
   * Authored and transformed observations of the same id are fed as two
   * artifacts. The inventory keeps both: the transformed one is the
   * browser-relevant fact set, while names authored in the same artifact keep
   * project provenance.
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
    // Astro compiles component <style> blocks into JS wrappers with no authored .css
    // artifact, so unwrap the embedded stylesheet or the catalog never sees
    // component-scoped custom properties (ADR-0011).
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

  /** The inventory keeps the last valid authored observation and records a recoverable diagnostic. */
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
      // The diagnostic below explains it without making the CSS catalog unavailable.
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
    // Retained even for an invalid export, so HMR can recover if the package publishes it later.
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


  /**
   * Hands everything this host observed about CSS dialects to the interpreter
   * and applies what comes back, so the snapshot carries final labels. Every
   * contribution is id-keyed and replaceable, so repeating this with unchanged
   * facts is a no-op and load() shares one path with the HMR exactly-once guard.
   */
  function syncInventoryContributions(): void {
    const { contributions } = interpretDialects({
      ...(options.tailwindV3 === undefined ? {} : { tailwindV3: options.tailwindV3 }),
      tailwindV4Css: tailwindV4SourceFiles.size > 0,
      ...(options.vanillaExtract?.themeContract === undefined ? {} : {
        inlineThemeContract: {
          contract: options.vanillaExtract.themeContract,
          ...(options.vanillaExtract.cssValues === undefined
            ? {}
            : { cssValues: options.vanillaExtract.cssValues }),
          ...(options.vanillaExtract.source === undefined
            ? {}
            : { source: options.vanillaExtract.source }),
        },
      }),
      publishedThemeContract: {
        attempted: options.vanillaExtract?.themeContractModule !== undefined
          && publishedThemeContractLoaded,
        contract: publishedThemeContract,
        fromPackage: publishedThemeContractModuleId !== null
          && isPackageStylesheet(publishedThemeContractModuleId, root),
        ...(options.vanillaExtract?.themeContractPrefix === undefined
          ? {}
          : { prefix: options.vanillaExtract.themeContractPrefix }),
        source: options.vanillaExtract?.source ?? options.vanillaExtract?.themeContractModule ?? "",
        diagnostics: contractDiagnostics,
      },
      diagnostics: [...sourceScanDiagnostics.values(), ...activeGraphDiagnostics],
    });
    for (const contribution of contributions) inventory.applyContribution(contribution);
  }

  /**
   * Publishes exactly once per observable snapshot change. Every HMR feed for
   * an event settles first, so identical facts do not bump the generation, and
   * contributions sync first so the guard compares what load() would serialize.
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
      // Project CSS counts before import; package CSS only via the active graph refresh below.
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

    // The module graph decides reachability: transforming only those entries drives
    // them through the observer plugin below without activating dead CSS files.
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
    await projectBridgeStart;
    await ensurePostTransformCss();
    await ensurePublishedThemeContract();
    return {
      version: 1,
      revision: 0,
      runtime: buildRuntimeSnapshot(),
      ...(projectBridge ? { agentBridge: projectBridge.browser } : {}),
    };
  }

  function startProjectBridge(server: ViteDevServer): void {
    // The public demo uses the shared editor runtime without project-owned
    // sessions, an agent bridge, or filesystem persistence.
    if (options.demo === true || !root || projectBridgeStart) return;
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") return;
    const origin = server.resolvedUrls?.local[0]
      ? new URL(server.resolvedUrls.local[0]).origin
      : loopbackOrigin(address, server.config.server.https ? "https" : "http");
    const allowedOrigins = [
      ...(server.resolvedUrls?.local ?? []),
      ...(server.resolvedUrls?.network ?? []),
    ].map((url) => new URL(url).origin);
    projectBridgeStart = startOptionalProjectBridge({
      appRoot: root,
      projectId: options.projectId ?? basename(root),
      origin,
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
      warn: (message) => server.config.logger.warn(message),
    }).then((bridge) => {
      projectBridge = bridge;
    });
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
      // Without a framework there are no component boundaries to describe, so the
      // project is HTML and CSS as far as the inspector is concerned.
      host: framework?.hostLabel ?? "static-html",
      framework: framework?.framework ?? "HTML",
      stylingSystem: detectStylingSystem(snapshot.tokens),
      ...(options.demo === true ? { demo: true } : {}),
      ...(options.demoPages === undefined ? {} : { demoPages: options.demoPages }),
      ...(options.demoCardLabels === undefined ? {} : { demoCardLabels: options.demoCardLabels }),
      capabilities: { canvas: true, componentSemantics: framework !== null },
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
    return framework?.contracts() ?? [];
  }

  const plugin: Plugin = {
    name: "nudge-ui",
    enforce: "pre",
    config(userConfig, env) {
      if (!enabled || env.command !== "serve") return;
      // Module resolution is a framework concern; without one this host asks nothing of the resolver.
      return framework?.viteConfig({
        projectRoot: userConfig.root ?? process.cwd(),
        demo: options.demo === true,
        existingDedupe: userConfig.resolve?.dedupe ?? [],
      });
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
      if (server.httpServer?.listening) startProjectBridge(server);
      else server.httpServer?.once("listening", () => startProjectBridge(server));
      server.httpServer?.once("close", () => {
        void projectBridgeStart?.then(() => projectBridge?.close()).finally(() => {
          projectBridge = null;
          projectBridgeStart = null;
        });
      });
      const runtimeWarning = framework?.unresolvedRuntimeWarning();
      if (runtimeWarning) server.config.logger.warn(runtimeWarning);
      server.middlewares?.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://nudge-ui.local").pathname;
        const invalidReservedMethod = (pathname === CLIENT_PATH || pathname === MANIFEST_PATH)
          ? request.method !== "GET"
          : pathname === NUDGE_UI_EDITOR_PATH
            && request.method !== "GET"
            && request.method !== "HEAD";
        if (invalidReservedMethod) {
          response.statusCode = 405;
          response.end();
          return;
        }
        if (isNudgeUiEditorDocumentRequest(request.url ?? "/", request.method, request.headers)) {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : createNudgeUiEditorDocument());
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
      // The browser imports virtual:design-tokens before styles.css is necessarily
      // transformed, so transform-only collection would yield an empty first load.
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
      framework?.warmUp();
    },
    resolveId(id) {
      if (id === VIRTUAL_TOKENS_ID || id === RESOLVED_TOKENS_ID) return RESOLVED_TOKENS_ID;
      if (id === VIRTUAL_INSPECTOR_ID || id === RESOLVED_INSPECTOR_ID) return RESOLVED_INSPECTOR_ID;
      if (frameworkModuleId(id)) return resolvedFrameworkModule();
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
        // Contributions merge inside the inventory; load() serializes one immutable
        // snapshot verbatim, so there is no post-snapshot enrichment or TOCTOU.
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
          const demoControllerExpression = demoBuild
            ? "true"
            : '(import.meta.env.DEV && window.location.pathname === "/")';
          // Taken from the composed framework, so the demo bootstrap cannot drift
          // from the manifest the transport serves.
          const identity = buildRuntimeSnapshot();
          return [
            'import { bootstrapNudgeUi, configureNudgeUiRuntime, createNudgeUiEditorUrl, detectFramework, hasNudgeUiDirectTabIntent, isCanvasRenderer, isNudgeUiDirectUrl, readNudgeUiEditorTarget, rememberNudgeUiDirectTabIntent } from "nudge-ui/internal/inspector";',
            'import { tokenCatalog, tokens, tokenDiagnostics, tokenGeneration, nudgeUiProjectId } from "virtual:design-tokens";',
            ...(framework
              ? [`import { componentContracts } from ${JSON.stringify(framework.virtualModuleId)};`]
              : []),
            'const __nudge_ui_renderer = isCanvasRenderer();',
            'const __nudge_ui_explicit_direct = isNudgeUiDirectUrl(window.location.href);',
            'if (__nudge_ui_explicit_direct) rememberNudgeUiDirectTabIntent();',
            'const __nudge_ui_direct_tab = hasNudgeUiDirectTabIntent();',
            `const __nudge_ui_demo_controller = !__nudge_ui_renderer && !__nudge_ui_explicit_direct && !__nudge_ui_direct_tab && ${demoControllerExpression};`,
            'const __nudge_ui_editor_target = readNudgeUiEditorTarget(window.location.href) ?? (__nudge_ui_demo_controller ? window.location.href : null);',
            'if (__nudge_ui_demo_controller && readNudgeUiEditorTarget(window.location.href) === null) {',
            '  window.history.replaceState(window.history.state, "", createNudgeUiEditorUrl(window.location.href));',
            '}',
            'if (__nudge_ui_editor_target) document.documentElement.setAttribute("data-nudge-ui-editor", "");',
            'if (__nudge_ui_renderer) document.documentElement.setAttribute("data-nudge-ui-renderer", "");',
            'if (__nudge_ui_editor_target || __nudge_ui_renderer) {',
            '  configureNudgeUiRuntime({',
            '    projectId: nudgeUiProjectId,',
            `    host: ${JSON.stringify(identity.host)},`,
            `    framework: ${JSON.stringify(identity.framework)},`,
            '    stylingSystem: detectFramework(tokens).stylingSystem,',
            '    demo: true,',
            `    demoPages: ${JSON.stringify(options.demoPages ?? [])},`,
            `    demoCardLabels: ${JSON.stringify(options.demoCardLabels ?? [])},`,
            `    capabilities: { canvas: true, componentSemantics: ${String(framework !== null)} },`,
            '    tokenCatalog,',
            '    tokens,',
            '    tokenDiagnostics,',
            '    tokenGeneration,',
            `    componentContracts${framework ? "" : ": []"},`,
            '  });',
            '  const __dt_root = document.getElementById("nudge-ui-root");',
            '  if (__dt_root) {',
            '    bootstrapNudgeUi(__dt_root);',
            '  }',
            '}',
            'window.addEventListener("nudge-ui:open", () => {',
            '  if (!__nudge_ui_renderer && (__nudge_ui_explicit_direct || __nudge_ui_direct_tab)) window.location.assign(createNudgeUiEditorUrl(window.location.href));',
            '});',
          ].join("\n");
        }
        return null;
      }
      if (framework && id === resolvedFrameworkModule()) {
        // ADR-0002: production builds receive an empty catalog.
        const productionBuild = command === "build" && !demoBuild;
        return framework.serializeVirtualModule(productionBuild ? [] : framework.contracts());
      }
      return null;
    },
    // React's Vite plugin is also `enforce: "pre"` with no explicit hook order, so
    // hook-level `order: "pre"` is what parses authored TSX before Babel prepends
    // refresh helpers and shifts the AST locations data-src depends on.
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
        // Everything past CSS belongs to the framework; with none, source modules are untouched.
        if (!framework) return null;
        return framework.transform({
          resolve: async (specifier, importer) => {
            const resolved = await this.resolve(specifier, importer, { skipSelf: true });
            return resolved ? stripCssQuery(resolved.id) : null;
          },
          warn: (message) => this.warn(message),
        }, code, id);
      },
    },
    transformIndexHtml(html) {
      // The landing app's static demo build imports the virtual module from the app
      // entry, because Vite cannot preserve the dev HTML virtual-module URL.
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
        // Same exactly-once path as the CSS branch.
        const { changed, generation, virtual } = invalidateTokensIfChanged(ctx.server);
        if (changed && virtual) return [...ctx.modules, virtual];
        if (generation !== previousGeneration) {
          ctx.server.ws.send({ type: "full-reload", path: "*" });
        }
        return;
      }
      if (framework?.owns(ctx.file)) {
        const previousGeneration = currentTokenGeneration();
        const previousContracts = JSON.stringify(componentContractCatalog());
        try {
          framework.observe(ctx.file, await ctx.read());
        } catch {
          framework.forget(ctx.file);
        }
        // Vite must update importer edges first: a component can add or remove a
        // stylesheet import while every CSS file remains on disk.
        invalidateHmrModules(ctx.server, ctx.modules, ctx.timestamp);
        try {
          await ctx.server.transformRequest(ctx.file);
        } catch {
          // Metadata still refreshes; the next successful transform rebuilds the roots.
        }
        postTransformPromise = null;
        await ensurePostTransformCss();

        const virtualComponents = ctx.server.moduleGraph.getModuleById(resolvedFrameworkModule()!);
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

      // So the next virtual-module load sees updated tokens; Vite's CSS reload runs in parallel.
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

      // ctx.read() returns authored source, so re-run it through Vite to pick up
      // Tailwind's generated stylesheet before invalidating below.
      postTransformPromise = null;
      try {
        await ctx.server.transformRequest(ctx.file);
      } catch {
        // Marks the transform failed so authored rows survive with a recoverable
        // diagnostic. A deleted file has no authored read and is a removal instead.
        if (hasAuthoredObservation) feedCssTransformFailure(ctx.file);
      }

      // Every feed for this event has settled, so invalidate only on a real
      // generation change. Vite's own CSS update below still runs either way.
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

  // Tailwind's generator is a pre-transform hook, so this companion stays in Vite's
  // normal group: after every pre plugin regardless of user order, and before Vite's
  // CSS-post JavaScript wrapper. The main plugin stays pre-ordered for TSX locations.
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
