import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import {
  basename,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Alias, ModuleNode, Plugin, ResolvedConfig, ViteDevServer } from "vite";
// Vite 5 externalizes bare dependencies while bundling its TypeScript config,
// which would leave Node to execute this workspace package's uncompiled `.ts`
// export. Reach the same public source entry directly until the package has a
// compiled distribution; the browser-safe CSS graph remains separate.
import {
  createTokenInventory,
  type ArtifactStage,
  type InventoryDiagnostic,
} from "../../css/src/token-inventory/index.ts";
import { injectIdentity } from "./transform/injectDataCid.ts";
import { discoverCssImportGraph, stripCssQuery } from "./tokens/activeStylesheets.ts";
import {
  catalogSourcePath,
  createViteStylesheetArtifact,
  isHostApplicationSource,
  isPackageStylesheet,
  orderViteStylesheetGraph,
} from "./tokens/viteStylesheetArtifacts.ts";
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
import type { ComponentContract } from "./components/types.ts";

export interface DesignToolOptions {
  enabled?: boolean;
  /** Explicit project ID for browser-storage keys (defaults to root directory basename). */
  projectId?: string;
  /**
   * Skip the react / react-dom / jsx-runtime dedupe aliases. Hosts whose own
   * pipeline already resolves React correctly (Astro's SSR module runner
   * chokes on the raw CJS entry) must set this; the Vite-React host keeps the
   * default behaviour.
   */
  skipReactAliases?: boolean;
  /** Optional static v3 config for fixture/app integrations; dynamic configs are not executed. */
  tailwindV3?: { config: TailwindV3Config; source?: string };
  vanillaExtract?: VanillaExtractAdapterOptions;
  /**
   * Optional contracts published by an npm design-system package. Local TSX
   * contracts are discovered automatically; package manifests fill the gap
   * when package source is intentionally not transformed.
   */
  componentMetadata?: ComponentContract[];
}

export type { ComponentContract, ComponentPropContract, ComponentPropValue } from "./components/types.ts";

const VIRTUAL_TOKENS_ID = "virtual:design-tokens";
const RESOLVED_TOKENS_ID = "\0" + VIRTUAL_TOKENS_ID;
const VIRTUAL_INSPECTOR_ID = "virtual:design-tool-inspector";
const RESOLVED_INSPECTOR_ID = "\0" + VIRTUAL_INSPECTOR_ID;
const VIRTUAL_COMPONENTS_ID = "virtual:design-tool-components";
const RESOLVED_COMPONENTS_ID = "\0" + VIRTUAL_COMPONENTS_ID;
const CSS_EXT = /\.css(?:$|[?#])/;
const COMPONENT_EXT = /\.(?:tsx|jsx)(?:$|[?#])/;

const MOUNT_DIV = `<div id="design-tool-root"></div>`;
const INSPECTOR_SCRIPT = `<script type="module" src="/@id/__x00__virtual:design-tool-inspector"></script>`;

function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : root + "/";
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
  }
  return id.replace(/^\//, "");
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

export function transformIndexHtmlHtml(
  html: string,
  command: "serve" | "build",
): string | null {
  if (command === "build") return null;
  const inject = `\n${MOUNT_DIV}\n${INSPECTOR_SCRIPT}\n`;
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

export function designTool(options: DesignToolOptions = {}): Plugin[] {
  const enabled = options.enabled ?? true;
  let root: string | undefined;
  let buildOutputDirectory: string | undefined;
  let command: "serve" | "build" = "serve";
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
  if (options.componentMetadata?.length) {
    componentContracts.set("package-manifests", options.componentMetadata.map((contract) => ({
      ...contract,
      provenance: "package-manifest",
    })));
  }
  const adapterRegistry = createTokenAdapterRegistry([
    ...(options.tailwindV3 ? [createTailwindV3Adapter(options.tailwindV3.config, options.tailwindV3.source)] : []),
    ...(options.vanillaExtract ? [createSprinklesAdapter(options.vanillaExtract)] : []),
  ]);

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
    code: string,
    stage: ArtifactStage,
    ordering: { order?: number; discoveryOrder?: number } = {},
  ): void {
    if (!CSS_EXT.test(id)) return;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    if (isGeneratedBuildOutput(fileId)) return;
    if (ordering.order !== undefined || ordering.discoveryOrder !== undefined) {
      stylesheetOrdering.set(fileId, { ...ordering });
    }
    if (stage === "authored") {
      if (/@import\s+["']tailwindcss["']|@theme\b/i.test(code)) tailwindV4SourceFiles.add(fileId);
      else tailwindV4SourceFiles.delete(fileId);
    }
    const artifact = createViteStylesheetArtifact({
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
    const artifact = createViteStylesheetArtifact({
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
    inventory.apply(createViteStylesheetArtifact({
      id: fileId,
      projectRoot: root,
      stage: "transformed",
      failed: true,
    }));
  }
  function cacheComponentsForFile(id: string, code: string): void {
    if (!COMPONENT_EXT.test(id) || !isHostApplicationSource(id, root)) return;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    const rel = relativePath(fileId, root);
    componentContracts.set(fileId, extractComponentContracts(code, rel));
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
    syncInventoryContributions();
    const generation = inventory.snapshot().generation;
    if (generation === lastPublishedGeneration) return { changed: false };
    lastPublishedGeneration = generation;
    const virtual = server.moduleGraph.getModuleById(RESOLVED_TOKENS_ID);
    if (virtual) server.moduleGraph.invalidateModule(virtual);
    return virtual ? { changed: true, virtual } : { changed: true };
  }

  async function handleStylesheetWatchEvent(
    server: ViteDevServer,
    file: string,
    event: "add" | "unlink",
  ): Promise<void> {
    if (!enabled || command !== "serve" || !CSS_EXT.test(file)) return;
    const hadPublishedSnapshot = lastPublishedGeneration !== null;
    postTransformPromise = null;

    if (event === "unlink") {
      server.moduleGraph.onFileDelete(file);
      activeHostCssFiles.delete(stripCssQuery(file));
      feedCssRemoval(file);
    } else {
      // Project CSS participates in the source inventory even before import;
      // package CSS is admitted only by the active graph refresh below.
      if (isHostApplicationSource(file, root)) {
        try {
          feedCssArtifact(file, readFileSync(file, "utf8"), "authored");
        } catch {
          const source = catalogSourcePath(file, root);
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

    const { changed } = invalidateTokensIfChanged(server);
    if (hadPublishedSnapshot && changed) {
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
        if (id && CSS_EXT.test(id) && isHostApplicationSource(id, root)
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
      if (isPackageStylesheet(fileId, root)) nextPackageFiles.add(fileId);
    }
    for (const previous of activePackageCssFiles) {
      if (!nextPackageFiles.has(previous)) feedCssRemoval(previous);
    }
    activeGraphDiagnostics = [
      ...graph.unreadable.map((id): InventoryDiagnostic => ({
        code: "stylesheet-unreadable",
        artifact: catalogSourcePath(id, root),
        message: `Could not read stylesheet ${catalogSourcePath(id, root)}.`,
      })),
      ...graph.unresolved.map(({ importer, specifier }): InventoryDiagnostic => ({
        code: "stylesheet-unresolved",
        artifact: catalogSourcePath(importer, root),
        module: specifier,
        message: `Could not resolve stylesheet import ${specifier} from ${catalogSourcePath(importer, root)}.`,
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

  const plugin: Plugin = {
    name: "design-tool",
    enforce: "pre",
    config(userConfig, env) {
      if (!enabled || env.command !== "serve") return;
      if (options.skipReactAliases) return;
      const projectRoot = userConfig.root ?? process.cwd();
      const aliases = resolveReactAliases(projectRoot);
      if (aliases.length === 0) return;
      return { resolve: { alias: aliases } };
    },
    configResolved(config: ResolvedConfig) {
      root = config.root;
      command = config.command;
      buildOutputDirectory = config.build?.outDir
        ? resolve(config.root, config.build.outDir)
        : undefined;
    },
    configureServer(server) {
      if (!enabled || command !== "serve") return;
      devServer = server;
      server.watcher?.on("add", (file) => handleStylesheetWatchEvent(server, file, "add"));
      server.watcher?.on("unlink", (file) => handleStylesheetWatchEvent(server, file, "unlink"));
    },
    buildStart() {
      // Eager scan so the token table is populated before the virtual module
      // is first loaded. The browser imports App -> virtual:design-tokens
      // before styles.css is necessarily transformed, so transform-only
      // collection would yield an empty first load.
      if (!enabled || command !== "serve" || !root) return;
      for (const cssPath of scanCssFiles(root, [], root, buildOutputDirectory)) {
        try {
          const code = readFileSync(cssPath, "utf8");
          if (isHostApplicationSource(cssPath, root)) discoveredHostCssFiles.add(cssPath);
          feedCssArtifact(cssPath, code, "authored");
        } catch {
          const rel = catalogSourcePath(cssPath, root);
          sourceScanDiagnostics.set(rel, {
            code: "stylesheet-unreadable",
            artifact: rel,
            message: `Could not read stylesheet ${rel}.`,
          });
        }
      }
      for (const componentPath of scanComponentFiles(root)) {
        try {
          cacheComponentsForFile(componentPath, readFileSync(componentPath, "utf8"));
        } catch {
          // skip unreadable component sources
        }
      }
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
        if (command === "build") {
          return `export const tokenCatalog = [];\nexport const tokens = [];\nexport const tokenDiagnostics = [];\nexport const tokenGeneration = "";\nexport const designToolProjectId = "";\nexport default tokens;\n`;
        }
        await ensurePostTransformCss();
        await ensurePublishedThemeContract();
        // Styling contributions merge INSIDE the inventory (see
        // `syncInventoryContributions`). load() takes ONE immutable snapshot
        // and serializes it verbatim — there is no post-snapshot enrichment and
        // no TOCTOU between the snapshot call and serialization.
        syncInventoryContributions();
        const snapshot = inventory.snapshot();
        lastPublishedGeneration = snapshot.generation;
        // Inventory diagnostics carry the offending artifact id; the virtual
        // transport's diagnostic shape calls that field `module`.
        const diagnostics: TokenCatalogDiagnostic[] = snapshot.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          module: diagnostic.module ?? diagnostic.artifact ?? "token-inventory",
          ...(diagnostic.exportName !== undefined ? { exportName: diagnostic.exportName } : {}),
        }));
        const projectId = JSON.stringify(options.projectId ?? (root ? basename(root) : ""));
        return `export const tokenCatalog = ${JSON.stringify(snapshot.definitions)};\nexport const tokens = ${JSON.stringify(snapshot.tokens)};\nexport const tokenDiagnostics = ${JSON.stringify(diagnostics)};\nexport const tokenGeneration = ${JSON.stringify(snapshot.generation)};\nexport const designToolProjectId = ${projectId};\nexport default tokens;\n`;
      }
      if (id === RESOLVED_INSPECTOR_ID) {
        // ADR-0002: no inspector bootstrap in production builds.
        if (command === "build") {
          return `export {};\n`;
        }
        return `import { bootstrapDesignTool, configureDesignToolRuntime, detectFramework } from "@design-tool/inspector";\nimport { tokenCatalog, tokens, tokenDiagnostics, tokenGeneration, designToolProjectId } from "virtual:design-tokens";\nimport { componentContracts } from "virtual:design-tool-components";\nconfigureDesignToolRuntime({\n  projectId: designToolProjectId,\n  host: "vite-react",\n  framework: "React",\n  stylingSystem: detectFramework(tokens).stylingSystem,\n  capabilities: { canvas: true, componentSemantics: true },\n  tokenCatalog,\n  tokens,\n  tokenDiagnostics,\n  tokenGeneration,\n  componentContracts,\n});\nconst __dt_root = document.getElementById("design-tool-root");\nif (__dt_root) bootstrapDesignTool(__dt_root);\n`;
      }
      if (id === RESOLVED_COMPONENTS_ID) {
        if (command === "build") return "export const componentContracts = [];\nexport default componentContracts;\n";
        const catalog = [...componentContracts.values()].flat();
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
      handler(code, id) {
        if (!enabled) return null;
        if (command === "build") return null; // dev-only per ADR-0002
        if (CSS_EXT.test(id)) {
          const fileId = stripCssQuery(id);
          if (isHostApplicationSource(fileId, root)) {
            activeHostCssFiles.add(fileId);
            discoveredHostCssFiles.add(fileId);
          }
          feedCssArtifact(id, code, "authored");
          return null; // let Vite's CSS pipeline handle the actual stylesheet
        }
        const instrumentComponents = isHostApplicationSource(id, root);
        if (COMPONENT_EXT.test(id) && instrumentComponents) {
          cacheComponentsForFile(id, code);
        }
        return injectIdentity(code, id, root, {
          // Runtime component boundaries belong to host application callsites.
          // Workspace packages and the inspector itself sit outside the Vite
          // application root and are therefore excluded without layout knowledge.
          instrumentComponents,
        });
      },
    },
    transformIndexHtml(html) {
      if (!enabled) return;
      const out = transformIndexHtmlHtml(html, command);
      return out === null ? undefined : out;
    },
    async handleHotUpdate(ctx) {
      if (!enabled || command !== "serve") return;
      if (publishedThemeContractModuleId && stripCssQuery(ctx.file) === publishedThemeContractModuleId) {
        invalidateHmrModules(ctx.server, ctx.modules, ctx.timestamp);
        publishedThemeContractLoaded = false;
        await ensurePublishedThemeContract();
        // Same exactly-once path as the CSS branch: invalidate the virtual
        // module only when the refreshed contract changed the snapshot.
        const { changed, virtual } = invalidateTokensIfChanged(ctx.server);
        if (changed && virtual) return [...ctx.modules, virtual];
        return;
      }
      if (COMPONENT_EXT.test(ctx.file)) {
        try {
          cacheComponentsForFile(ctx.file, await ctx.read());
        } catch {
          componentContracts.set(ctx.file, []);
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
        const { changed, virtual: virtualTokens } = invalidateTokensIfChanged(ctx.server);
        const modules = [...ctx.modules];
        if (virtualComponents) {
          ctx.server.moduleGraph.invalidateModule(virtualComponents);
          modules.push(virtualComponents);
        }
        if (changed && virtualTokens) {
          modules.push(virtualTokens);
        }
        return modules.length > 0 ? [...new Set(modules)] : undefined;
      }
      if (!CSS_EXT.test(ctx.file)) return;

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
          const rel = catalogSourcePath(fileId, root);
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
      const { changed, virtual } = invalidateTokensIfChanged(ctx.server);
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
    name: "design-tool:transformed-css",
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
