/**
 * Compiler-facing loader entry (webpack shape) registered by
 * `withNudgeUi` for both Turbopack rules and webpack module rules
 * (ADR-0010).
 *
 * Shape constraints established against Next 16.3.2, whose Turbopack runs
 * rules through a webpack LoaderRunner compatibility layer evaluated with
 * Node's TypeScript type-stripping:
 *
 * - The evaluated module ITSELF must be the loader function: an ESM default
 *   export lands behind `module.exports.default` and is rejected with "is
 *   not a loader". Hence CommonJS `module.exports =` in a `.cts` file.
 * - Only strippable TypeScript syntax: no `export =`, no runtime `import`
 *   statements — the pure Module is pulled in with `require`.
 * - Sourcemaps are deliberately omitted: passing a map through
 *   `this.callback` corrupts the pipeline (Turbopack re-reads map source
 *   entries as assets and dies on them). Identity attribution lives in the
 *   rendered DOM (`data-src`), not in devtools mappings, so the tracer
 *   bullet ships code-only output.
 *
 * Deliberately boring body: byte-preserved passthrough when nothing applies;
 * asynchronous only while the host resolves component provenance.
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
  componentProtocols?: import("@nudge-ui/compiler").ComponentModuleProtocols;
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
      hostPolicy?: import("@nudge-ui/compiler").HostComponentPolicy;
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
} = require("@nudge-ui/compiler") as typeof import("@nudge-ui/compiler");

const NEXT_COMPONENT_RUNTIME_MODULE = "nudge-ui/next/component-runtime";
// SAFETY: A local require of the sibling repository-scope module, whose export shape is asserted by its own contract.
const { nudgeUiRepositoryPackagePattern } = require("./repositoryScope.ts") as {
  nudgeUiRepositoryPackagePattern: RegExp;
};

const nodePath = require("node:path");
const nodeFs = require("node:fs");

/**
 * One canonical project root per loader process. Compilers report
 * `resourcePath` in canonical form while the wrapper's root comes from
 * `process.cwd()`, whose textual form can differ on symlinked paths (macOS
 * `/tmp` vs `/private/tmp`); a textual prefix check would then silently drop
 * every posting. Canonicalizing both sides keeps the relative file key — the
 * sidecar's aggregation key — identical to what the scanner and watcher use.
 */
const canonicalRootCache = new Map<string, string>();
// Import provenance checks canonicalise the same files once per trace step and
// once per module, so memoise them for the loader process.
const canonicalFileCache = new Map<string, string>();
const reportedComponentPolicyDiagnostics = new Set<string>();
let reportedMissingResolver = false;

/**
 * Report a loader runner that cannot resolve import provenance. Without host
 * resolution the shared compiler can only add identity attributes, so the
 * semantic component layer would be off with no other signal.
 */
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
    /* an unresolvable root keeps its textual form */
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

/**
 * Publishes one file's component contracts to the sidecar's aggregation
 * endpoint (Stage 5). Fire-and-forget: contract transport must never break
 * compilation. The sidecar port comes from the state file the sidecar writes
 * under `<root>/.next`; a missing or stale record simply skips publishing.
 */
function postContracts(root: string, relativeFile: string, source: string): void {
  // Empty results are published too: a file whose components were all
  // removed must PRUNE its stale entry, not silently keep old controls.
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
  // Defense-in-depth for ADR-0002: even if a wrapper were misconfigured into
  // a production build (e.g. NODE_ENV=development next build through a custom
  // server), Next sets NEXT_PHASE per invocation — skip every transform when
  // that phase says production build. Unknown/absent phases still transform,
  // so exotic dev harnesses keep working.
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
    // An explicit sourceRoots entry outranks the repository-tooling exclusion so
    // a consumer's own package is instrumentable even when its directory name
    // matches one of Nudge UI's own packages.
    return isExplicitlyOwned(canonicalFile) || !nudgeUiRepositoryPackagePattern.test(canonicalFile);
  };
  // Identity paths are always project-root relative: a file outside the root
  // keeps a `../`-prefixed relative path rather than serialising a machine
  // path. This matches the Vite Adapter and keeps sourceRoots identities
  // unique across packages.
  const sourcePath = (resolvedId: string): string =>
    nodePath.relative(canonicalRoot, canonicalSourceFile(resolvedId)).split("\\").join("/");

  // Contracts are extracted from the AUTHORED source so line/column
  // provenance matches what prompts will name. Confined to first-party
  // sources exactly like identity injection: workspace tooling components
  // must never enter the contract catalog.
  if (root && moduleId && isProjectSource(moduleId)) {
    try {
      postContracts(root, sourcePath(moduleId), source);
    } catch {
      /* never break compilation for knowledge transport */
    }
  }

  const instrumentComponents = isProjectSource(moduleId);
  const transform = (hostPolicy?: import("@nudge-ui/compiler").HostComponentPolicy) =>
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
    }).then((hostPolicy: import("@nudge-ui/compiler").HostComponentPolicy) => {
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
    // Semantic callsites need host resolution of import provenance. Without it
    // every imported component would silently degrade to identity attributes
    // alone, so report the missing capability once per loader process.
    warnMissingResolver(this);
  }

  const result = transform();

  if (!result) {
    // Byte-preservation contract: untouched modules fall through unchanged.
    return source;
  }

  this.callback?.(null, result.code);
  return undefined;
}

module.exports = nudgeUiLoader;
