/**
 * Turbopack runs this through a webpack LoaderRunner compatibility layer: the module
 * itself must be the loader (hence CJS in .cts, `require`, no sourcemap — a map through
 * `this.callback` corrupts Turbopack's pipeline).
 */

interface NudgeUiLoaderContext {
  resourcePath?: string;
  query?: string | Record<string, unknown>;
  getOptions?: () => Record<string, unknown>;
  callback?: (error: Error | null, content?: string | Buffer) => void;
  rootContext?: string;
  async?: () => (error: Error | null, content?: string | Buffer) => void;
  getResolve?: (options: Record<string, unknown>) => (
    context: string,
    request: string,
  ) => Promise<string>;
  addDependency?: (path: string) => void;
  emitWarning?: (warning: Error) => void;
}

interface LoaderOptions {
  root?: string;
  pagesDir?: string;
  componentProtocols?: import("../../compiler/index.ts").ComponentModuleProtocols;
  sourceRoots?: readonly string[];
}

// SAFETY: A local require of the sibling loader module, whose export shape is asserted by its own module contract.
const { transformNextModuleSource } = require("./loader.ts") as {
  transformNextModuleSource: (
    source: string,
    moduleId: string,
    options?: {
      root?: string;
      pagesDir?: string;
      hostPolicy?: import("../../compiler/index.ts").HostComponentPolicy;
      instrumentComponents?: boolean;
      componentRuntimeModule?: string;
    },
  ) => { code: string } | null;
};
// SAFETY: `typeof import(...)` derives the asserted shape from the module's own declaration, so the required exports cannot drift.
const {
  extractComponentContracts,
  defaultReactComponentProtocols,
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  mergeComponentModuleProtocols,
  resolveHostComponentPolicy,
} = require("../../compiler/index.ts") as typeof import("../../compiler/index.ts");

const NEXT_COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";
// SAFETY: A local require of the sibling repository-scope module, whose export shape is asserted by its own contract.
const { nudgeUiRepositoryPackagePattern } = require("./repositoryScope.ts") as {
  nudgeUiRepositoryPackagePattern: RegExp;
};

const nodePath = require("node:path");
const nodeFs = require("node:fs");

/**
 * Compilers report canonical resourcePaths while the wrapper's root comes from
 * `process.cwd()`, whose textual form can differ on symlinked paths (macOS /tmp vs
 * /private/tmp); canonicalizing both keeps the sidecar's aggregation key identical.
 */
const canonicalRootCache = new Map<string, string>();
// Provenance checks canonicalise the same files repeatedly, so memoise them for the loader process.
const canonicalFileCache = new Map<string, string>();
const reportedComponentPolicyDiagnostics = new Set<string>();
let reportedMissingResolver = false;

/** Without host import resolution the semantic layer degrades silently to identity attributes, so report once per loader process. */
function warnMissingResolver(context: NudgeUiLoaderContext): void {
  if (reportedMissingResolver) return;
  reportedMissingResolver = true;
  const message =
    "[nudge-ui] The Next.js loader runner exposed no import resolver (getResolve/async), so "
    + "semantic component callsites fall back to identity attributes only. Turbopack and "
    + "webpack provide one; custom runners must implement both.";
  if (context.emitWarning) context.emitWarning(new Error(message));
  else process.emitWarning(message);
}

function canonicalProjectRoot(root: string): string {
  const cached = canonicalRootCache.get(root);
  if (cached !== undefined) return cached;
  let realRoot = root;
  try {
    realRoot = nodeFs.realpathSync(root);
  } catch {
    /* unresolvable roots keep their textual form */
  }
  canonicalRootCache.set(root, realRoot);
  return realRoot;
}

function canonicalSourceFile(file: string): string {
  const cached = canonicalFileCache.get(file);
  if (cached !== undefined) return cached;
  let canonical = nodePath.resolve(file);
  try {
    canonical = nodeFs.realpathSync(file);
  } catch {
    /* an unresolvable file keeps its resolved form */
  }
  canonicalFileCache.set(file, canonical);
  return canonical;
}

function isInsideSourceRoot(file: string, root: string): boolean {
  const relativeFile = nodePath.relative(root, file);
  return relativeFile === ""
    || (relativeFile !== ".."
      && !relativeFile.startsWith(`..${nodePath.sep}`)
      && !nodePath.isAbsolute(relativeFile));
}

/** Publishes one file's contracts to the sidecar's aggregation endpoint; the port comes from the state file under `<root>/.next`. */
function postContracts(root: string, relativeFile: string, source: string): void {
  // Empty results are published too, so a file whose components were all removed prunes its stale entry.
  const contracts = extractComponentContracts(source, relativeFile);
  let port = 0;
  try {
    // SAFETY: The JSON.parse result is validated by the typeof/Array.isArray guards below before use.
    const raw = JSON.parse(
      nodeFs.readFileSync(nodePath.join(root, ".next", "nudge-ui-sidecar.json"), "utf8"),
    ) as { port?: number };
    port = typeof raw.port === "number" ? raw.port : 0;
  } catch {
    return;
  }
  if (!port) return;
  const body = JSON.stringify({ file: relativeFile, contracts });
  void fetch(`http://127.0.0.1:${port}/__nudge_ui__/contracts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).catch(() => {});
}

function readOptions(context: NudgeUiLoaderContext): LoaderOptions {
  if (typeof context.getOptions === "function") {
    // SAFETY: getOptions() is the loader API's own typed accessor for configure() options.
    return context.getOptions() as LoaderOptions;
  }
  // Older/Turbopack-subset contexts may expose webpack's legacy `query`.
  if (context.query && typeof context.query === "object") {
    // SAFETY: webpack's legacy `query` field carries the same options object as getOptions().
    return context.query as LoaderOptions;
  }
  return {};
}

function nudgeUiLoader(
  this: NudgeUiLoaderContext,
  source: string,
): string | undefined {
  // Defense-in-depth: Next sets NEXT_PHASE per invocation, so even a misconfigured production
  // build skips every transform; unknown/absent phases still transform so dev harnesses work.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return source;
  }

  const options = readOptions(this);
  const moduleId = this.resourcePath ?? "";
  const root = options.root ?? this.rootContext;
  const canonicalRoot = canonicalProjectRoot(
    root ?? this.rootContext ?? nodePath.dirname(moduleId || process.cwd()),
  );
  const declaredSourceRoots = (options.sourceRoots ?? []).map(canonicalProjectRoot);
  const sourceRoots = [canonicalRoot, ...declaredSourceRoots];
  const matchedSourceRoot = (canonicalFile: string): string | null =>
    sourceRoots.find((sourceRoot) => isInsideSourceRoot(canonicalFile, sourceRoot)) ?? null;
  const isExplicitlyOwned = (canonicalFile: string): boolean =>
    declaredSourceRoots.some((sourceRoot) => isInsideSourceRoot(canonicalFile, sourceRoot));
  const isProjectSource = (resolvedId: string): boolean => {
    const canonicalFile = canonicalSourceFile(resolvedId);
    const normalized = canonicalFile.split("\\").join("/");
    if (normalized.includes("/node_modules/") || normalized.includes("/.next/")) return false;
    if (!matchedSourceRoot(canonicalFile)) return false;
    // An explicit sourceRoots entry outranks the repository-tooling exclusion, so a
    // consumer's similarly-named package stays instrumentable.
    return isExplicitlyOwned(canonicalFile) || !nudgeUiRepositoryPackagePattern.test(canonicalFile);
  };
  // Identity paths stay project-root relative (a `../` prefix for outside files) rather
  // than serialising a machine path; matches the Vite Adapter.
  const sourcePath = (resolvedId: string): string =>
    nodePath.relative(canonicalRoot, canonicalSourceFile(resolvedId)).split("\\").join("/");

  // Contracts are extracted from the authored source so line/column provenance matches
  // what prompts name; first-party-only, exactly like identity injection.
  if (root && moduleId && isProjectSource(moduleId)) {
    try {
      postContracts(root, sourcePath(moduleId), source);
    } catch {
      /* never break compilation for knowledge transport */
    }
  }

  const instrumentComponents = isProjectSource(moduleId);
  const transform = (hostPolicy?: import("../../compiler/index.ts").HostComponentPolicy) =>
    transformNextModuleSource(source, moduleId, {
      root,
      pagesDir: options.pagesDir,
      hostPolicy,
      instrumentComponents,
      componentRuntimeModule: NEXT_COMPONENT_RUNTIME_MODULE,
    });

  const resolveImport = this.getResolve?.({
    dependencyType: "esm",
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json", "..."],
  });
  const asyncCallback = resolveImport && instrumentComponents ? this.async?.() : undefined;
  if (resolveImport && asyncCallback) {
    void resolveHostComponentPolicy(source, moduleId, {
      resolve: async (specifier: string, importer: string) => {
        try {
          return await resolveImport(nodePath.dirname(importer), specifier);
        } catch {
          return null;
        }
      },
      read: async (resolvedId: string) => {
        try {
          this.addDependency?.(resolvedId);
          return nodeFs.readFileSync(resolvedId, "utf8");
        } catch {
          return null;
        }
      },
      isProjectSource,
      sourcePath,
    }, {
      moduleProtocols: mergeComponentModuleProtocols(
        defaultReactComponentProtocols,
        options.componentProtocols,
      ),
    }).then((hostPolicy: import("../../compiler/index.ts").HostComponentPolicy) => {
      for (const grouped of groupComponentPolicyDiagnostics(hostPolicy.diagnostics)) {
        if (reportedComponentPolicyDiagnostics.has(grouped.key)) continue;
        reportedComponentPolicyDiagnostics.add(grouped.key);
        this.emitWarning?.(new Error(formatComponentPolicyWarning(
          grouped,
          sourcePath(moduleId),
          "Add component protocol metadata to opt in compatible package exports.",
        )));
      }
      const result = transform(hostPolicy);
      asyncCallback(null, result?.code ?? source);
    }).catch((error: unknown) => {
      asyncCallback(error instanceof Error ? error : new Error(String(error)));
    });
    return undefined;
  }

  if (instrumentComponents && !asyncCallback) {
    warnMissingResolver(this);
  }

  const result = transform();

  if (!result) {
    return source;
  }

  this.callback?.(null, result.code);
  return undefined;
}

module.exports = nudgeUiLoader;
