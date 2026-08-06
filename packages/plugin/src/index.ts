import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Alias, Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { createTokenInventory } from "@design-tool/css/token-inventory";
import type { ArtifactStage } from "@design-tool/css/token-inventory";
import { injectIdentity } from "./transform/injectDataCid.ts";
import { parseTokenCatalog } from "./tokens/parseTokens.ts";
import { discoverCssImportGraph, stripCssQuery } from "./tokens/activeStylesheets.ts";
import type { TokenCatalogDiagnostic, TokenDefinition, TokenEntry } from "./virtual/design-tokens.ts";
import { detectTailwindV4 } from "./adapters/tailwindV4.ts";
import { createTailwindV3Adapter } from "./adapters/tailwindV3.ts";
import type { TailwindV3Config } from "./adapters/tailwindV3.ts";
import { createSprinklesAdapter } from "./adapters/vanillaExtract.ts";
import type { ThemeContract, VanillaExtractAdapterOptions } from "./adapters/vanillaExtract.ts";
import { enrichVanillaExtractCatalog, materializeVanillaExtractContract } from "./adapters/vanillaExtractContract.ts";
import { createTokenAdapterRegistry } from "./adapters/registry.ts";
import { extractComponentContracts } from "./components/extractContracts.ts";
import type { ComponentContract } from "./components/types.ts";

export interface DesignToolOptions {
  enabled?: boolean;
  /** Explicit project ID for browser-storage keys (defaults to root directory basename). */
  projectId?: string;
  /** Optional static v3 config for fixture/app integrations; dynamic configs are not executed. */
  tailwindV3?: { config: TailwindV3Config };
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

function isPackageStylesheet(id: string, projectRoot: string | undefined): boolean {
  return !isHostApplicationSource(id, projectRoot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep package sources useful to people without serialising machine-specific paths. */
function catalogSourcePath(id: string, projectRoot: string | undefined): string {
  const fileId = stripCssQuery(id).replace(/\\/g, "/");
  if (!isPackageStylesheet(fileId, projectRoot)) return relativePath(fileId, projectRoot);
  const nodeModules = fileId.lastIndexOf("/node_modules/");
  if (nodeModules >= 0) return fileId.slice(nodeModules + "/node_modules/".length);
  if (projectRoot) return relative(projectRoot, fileId).replace(/\\/g, "/");
  return fileId.replace(/^\//, "");
}

export function isHostApplicationSource(
  id: string,
  projectRoot: string | undefined,
): boolean {
  if (!projectRoot || id.startsWith("\0")) return false;
  const fileId = id.split(/[?#]/, 1)[0] ?? id;
  if (
    fileId.includes("/node_modules/")
    || fileId.includes("\\node_modules\\")
  ) return false;
  const absoluteFile = isAbsolute(fileId)
    ? resolve(fileId)
    : resolve(projectRoot, fileId);
  const relativeFile = relative(resolve(projectRoot), absoluteFile);
  return relativeFile !== ""
    && relativeFile !== ".."
    && !relativeFile.startsWith(`..${sep}`)
    && !isAbsolute(relativeFile);
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

export function designTool(options: DesignToolOptions = {}): Plugin {
  const enabled = options.enabled ?? true;
  let root: string | undefined;
  let buildOutputDirectory: string | undefined;
  let command: "serve" | "build" = "serve";
  let devServer: ViteDevServer | undefined;
  let postTransformPromise: Promise<void> | null = null;
  const inventory = createTokenInventory();
  let activePackageCssFiles = new Set<string>();
  let publishedThemeContract: ThemeContract | null = null;
  let publishedThemeContractModuleId: string | null = null;
  let publishedThemeContractLoaded = false;
  let contractDiagnostics: TokenCatalogDiagnostic[] = [];
  const componentContracts = new Map<string, ComponentContract[]>();
  if (options.componentMetadata?.length) {
    componentContracts.set("package-manifests", options.componentMetadata.map((contract) => ({
      ...contract,
      provenance: "package-manifest",
    })));
  }
  const projectTailwindTokenNamesByFile = new Map<string, Set<string>>();
  /**
   * cssNames observed in Tailwind v4-detected content, keyed by normalized
   * artifact id. Kept separate from the inventory so the temporary provenance
   * annotation (see `applyTailwindV4ProvenanceAnnotation`) can relabel
   * compiler-emitted rows without the inventory knowing about Tailwind.
   */
  const tailwindAnnotatedNamesByRel = new Map<string, Set<string>>();
  const adapterRegistry = createTokenAdapterRegistry([
    ...(options.tailwindV3 ? [createTailwindV3Adapter(options.tailwindV3.config)] : []),
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
   * Reconciliation policy for 2.3: one row per artifact id. A later
   * observation for the same id REPLACES the earlier row, so feeding the same
   * file authored-then-transformed yields the transformed content at
   * `stage: "transformed"` with the transformed artifact's own provenance.
   * The full authored/transformed reconciliation is S2-C (plan slice 2.4).
   */
  function feedCssArtifact(id: string, code: string, stage: ArtifactStage, sourceScan = false): void {
    if (!CSS_EXT.test(id)) return;
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    if (isGeneratedBuildOutput(fileId)) return;
    const rel = catalogSourcePath(fileId, root);
    if (sourceScan && root && fileId.startsWith(root) && !fileId.includes("/node_modules/")) {
      // The initial source scan sees authored CSS before Tailwind expands its
      // import. Remember those names so the emitted catalog can retain project
      // provenance instead of labelling every v4 variable framework.
      const parsed = parseTokenCatalog(code, rel);
      projectTailwindTokenNamesByFile.set(fileId, new Set(parsed.map((definition) => definition.cssName)));
    }
    if (detectTailwindV4(code)) {
      const parsed = parseTokenCatalog(code, rel);
      tailwindAnnotatedNamesByRel.set(rel, new Set(parsed.map((definition) => definition.cssName)));
    }
    inventory.apply({
      buildTool: "vite",
      id: rel,
      stage,
      provenance: isHostApplicationSource(fileId, root) ? "project" : "package",
      content: code,
    });
  }

  /** Drop one artifact's rows from the inventory (no content = removal). */
  function feedCssRemoval(id: string): void {
    const fileId = id.split(/[?#]/, 1)[0] ?? id;
    const rel = catalogSourcePath(fileId, root);
    tailwindAnnotatedNamesByRel.delete(rel);
    inventory.apply({
      buildTool: "vite",
      id: rel,
      stage: "authored",
      provenance: isHostApplicationSource(fileId, root) ? "project" : "package",
    });
  }

  /**
   * Temporary Tailwind v4 provenance annotation applied to the inventory
   * snapshot before serialization. Tailwind v4's tokens already exist in the
   * emitted CSS, so this only relabels rows: names the project authored stay
   * editable project tokens; everything else is framework-owned. Package rows
   * are never relabelled (a package artifact must not become editable).
   *
   * TODO(S2-C): move this into the styling Adapter / inventory contribution
   * seam so the plugin stops mapping individual token provenance after the
   * snapshot is built.
   */
  function applyTailwindV4ProvenanceAnnotation(definitions: TokenDefinition[]): TokenDefinition[] {
    if (tailwindAnnotatedNamesByRel.size === 0) return definitions;
    const tailwindAnnotatedCssNames = new Set<string>();
    for (const names of tailwindAnnotatedNamesByRel.values()) {
      for (const name of names) tailwindAnnotatedCssNames.add(name);
    }
    const projectTokenNames = new Set<string>();
    for (const names of projectTailwindTokenNamesByFile.values()) {
      for (const name of names) projectTokenNames.add(name);
    }
    return definitions.map((definition) => {
      if (!tailwindAnnotatedCssNames.has(definition.cssName)) return definition;
      if (definition.origin === "package") return definition;
      const project = projectTokenNames.has(definition.cssName);
      return {
        ...definition,
        adapter: "tailwind-v4",
        origin: project ? "project" : "framework",
        editable: project,
      };
    });
  }

  function definitionToTokenEntry(definition: TokenDefinition): TokenEntry {
    return {
      name: definition.name,
      cssName: definition.cssName,
      value: definition.declarations[0]?.value ?? "",
      source: definition.declarations[0]?.source ?? "",
      cssValue: definition.cssValue,
      adapter: definition.adapter,
      origin: definition.origin,
      editable: definition.editable,
    };
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

    let namespace: Record<string, unknown>;
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

  function enrichCatalogWithPublishedThemeContract(catalog: TokenDefinition[]): TokenDefinition[] {
    if (!publishedThemeContract) return catalog;
    const moduleSpecifier = options.vanillaExtract?.themeContractModule;
    if (!moduleSpecifier) return catalog;
    return enrichVanillaExtractCatalog(catalog, materializeVanillaExtractContract(publishedThemeContract, {
      prefix: options.vanillaExtract?.themeContractPrefix,
      source: options.vanillaExtract?.source ?? moduleSpecifier,
      origin: publishedThemeContractModuleId && isPackageStylesheet(publishedThemeContractModuleId, root)
        ? "package"
        : "project",
    }));
  }

  async function refreshActiveStylesheetTokens(): Promise<void> {
    if (!devServer || !root) return;
    const graph = await discoverCssImportGraph(scanCssFiles(root, [], root, buildOutputDirectory), {
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
    for (const [id, code] of graph.files) {
      const fileId = stripCssQuery(id);
      feedCssArtifact(fileId, code, "authored", isHostApplicationSource(fileId, root));
      if (isPackageStylesheet(fileId, root)) nextPackageFiles.add(fileId);
    }
    for (const previous of activePackageCssFiles) {
      if (!nextPackageFiles.has(previous)) feedCssRemoval(previous);
    }
    activePackageCssFiles = nextPackageFiles;
  }

  function ensurePostTransformCss(): Promise<void> {
    if (!devServer || !root || command !== "serve") return Promise.resolve();
    if (postTransformPromise) return postTransformPromise;

    // The virtual module can be requested before the browser requests its CSS
    // imports. Ask Vite to transform every authored stylesheet first so
    // Tailwind's generated CSS (rather than just `@import "tailwindcss"`) has
    // passed through the normal plugin pipeline and reached our transform hook.
    postTransformPromise = (async () => {
      await refreshActiveStylesheetTokens();
      await Promise.all(scanCssFiles(root, [], root, buildOutputDirectory).map(async (cssPath) => {
        try {
          await devServer!.transformRequest(cssPath);
        } catch {
          // The regular source scan remains available when a stylesheet cannot
          // be transformed yet (for example while it is being deleted).
        }
      }));
    })();
    return postTransformPromise;
  }

  return {
    name: "design-tool",
    enforce: "pre",
    config(userConfig, env) {
      if (!enabled || env.command !== "serve") return;
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
          feedCssArtifact(cssPath, code, "authored", true);
        } catch {
          // skip unreadable files
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
          return `export const tokenCatalog = [];\nexport const tokens = [];\nexport const tokenDiagnostics = [];\nexport const designToolProjectId = "";\nexport default tokens;\n`;
        }
        await ensurePostTransformCss();
        await ensurePublishedThemeContract();
        // Styling-Adapter literal tokens (Tailwind v3 config, Sprinkles
        // contracts) merge as inventory contributions; the engine replaces any
        // stylesheet definition with the same key, matching legacy load().
        inventory.setAdapterTokens(adapterRegistry.extractTokens());
        const snapshot = inventory.snapshot();
        // The inventory snapshot is the authoritative definitions/order. Only
        // additive contributions may follow: the Tailwind v4 provenance
        // annotation and the published vanilla-extract theme-contract
        // enrichment. Both stay here as temporary post-snapshot stages until
        // S2-C moves them into the Adapter/inventory contribution seam.
        const catalog = enrichCatalogWithPublishedThemeContract(
          applyTailwindV4ProvenanceAnnotation([...snapshot.definitions]),
        );
        const all: TokenEntry[] = catalog.map(definitionToTokenEntry);
        const diagnostics: TokenCatalogDiagnostic[] = [
          // Inventory diagnostics carry the offending artifact id; the virtual
          // transport's diagnostic shape calls that field `module`.
          ...snapshot.diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            message: diagnostic.message,
            module: diagnostic.artifact,
          })),
          ...contractDiagnostics,
        ];
        const projectId = JSON.stringify(options.projectId ?? (root ? basename(root) : ""));
        return `export const tokenCatalog = ${JSON.stringify(catalog)};\nexport const tokens = ${JSON.stringify(all)};\nexport const tokenDiagnostics = ${JSON.stringify(diagnostics)};\nexport const tokenGeneration = ${JSON.stringify(snapshot.generation)};\nexport const designToolProjectId = ${projectId};\nexport default tokens;\n`;
      }
      if (id === RESOLVED_INSPECTOR_ID) {
        // ADR-0002: no inspector bootstrap in production builds.
        if (command === "build") {
          return `export {};\n`;
        }
        return `import { bootstrapDesignTool } from "@design-tool/inspector";\nconst __dt_root = document.getElementById("design-tool-root");\nif (__dt_root) bootstrapDesignTool(__dt_root);\n`;
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
          feedCssArtifact(id, code, "transformed");
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
        publishedThemeContractLoaded = false;
        await ensurePublishedThemeContract();
        const virtual = ctx.server.moduleGraph.getModuleById(RESOLVED_TOKENS_ID);
        if (virtual) {
          ctx.server.moduleGraph.invalidateModule(virtual);
          return [...ctx.modules, virtual];
        }
        return;
      }
      if (COMPONENT_EXT.test(ctx.file)) {
        try {
          cacheComponentsForFile(ctx.file, await ctx.read());
        } catch {
          componentContracts.set(ctx.file, []);
        }
        const virtualComponents = ctx.server.moduleGraph.getModuleById(RESOLVED_COMPONENTS_ID);
        if (virtualComponents) {
          ctx.server.moduleGraph.invalidateModule(virtualComponents);
          return [...ctx.modules, virtualComponents];
        }
        return;
      }
      if (!CSS_EXT.test(ctx.file)) return;

      // Refresh the token inventory immediately so the next virtual-module load
      // sees the updated tokens (Vite's own CSS reload happens in parallel).
      try {
        const code = await ctx.read();
        feedCssArtifact(ctx.file, code, "authored", true);
      } catch {
        feedCssRemoval(ctx.file);
      }

      await refreshActiveStylesheetTokens();

      // ctx.read() returns authored source. Re-run the CSS through Vite so the
      // transform hook can replace that snapshot with Tailwind's generated
      // stylesheet before the virtual module is invalidated below.
      postTransformPromise = null;
      try {
        await ctx.server.transformRequest(ctx.file);
      } catch {
        // Keep the authored snapshot if the post-transform request fails.
      }

      // Invalidate the virtual module and let Vite propagate HMR to importers
      // (App.tsx via React Refresh). Returning the virtual module alongside
      // the affected CSS module(s) replaces Vite's default module list so BOTH
      // the stylesheet's visual update and the tokens list refresh fire.
      const virtual = ctx.server.moduleGraph.getModuleById(
        RESOLVED_TOKENS_ID,
      );
      const modules: NonNullable<ReturnType<typeof ctx.server.moduleGraph.getModuleById>>[] = [];
      if (virtual) {
        ctx.server.moduleGraph.invalidateModule(virtual);
        modules.push(virtual);
      }
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
}

export { injectIdentity, injectDataCid } from "./transform/injectDataCid.ts";
export type { InjectResult } from "./transform/injectDataCid.ts";
export { parseTokens, parseTokenCatalog } from "./tokens/parseTokens.ts";
export type { TokenContext, TokenDeclaration, TokenDefinition, TokenEntry } from "./virtual/design-tokens.ts";
export { annotateTailwindV4Catalog, createTailwindV4Adapter, detectTailwindV4, entriesFromTailwindV4Catalog, mapTailwindV4ColorOpacity, tailwindV4ColorExpression } from "./adapters/tailwindV4.ts";
export type { TailwindAlphaMapping } from "./adapters/tailwindV4.ts";
export { createTailwindV3Adapter, detectTailwindV3Config, extractTailwindV3Tokens, resolveTailwindV3ClassName, tailwindV3ColorDeclaration } from "./adapters/tailwindV3.ts";
export type { TailwindV3Config, TailwindV3Mapping } from "./adapters/tailwindV3.ts";
export { createTokenAdapterRegistry } from "./adapters/registry.ts";
export { createSprinklesAdapter, createVanillaExtractAdapter, extractVanillaExtractTokens, resolveSprinklesClassName } from "./adapters/vanillaExtract.ts";
export type { TokenAdapter, TokenMapping } from "./adapters/types.ts";
export type { ThemeContract, SprinklesClassMap, VanillaExtractAdapterOptions } from "./adapters/vanillaExtract.ts";
export { materializeVanillaExtractContract, mergeVanillaExtractContract } from "./adapters/vanillaExtractRuntime.ts";
export type { MaterializedTokenCatalog, MaterializeVanillaExtractOptions } from "./adapters/vanillaExtractRuntime.ts";
