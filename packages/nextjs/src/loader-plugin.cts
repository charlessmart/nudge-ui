/**
 * Compiler-facing loader entry (webpack shape) registered by
 * `withDesignTool` for both Turbopack rules and webpack module rules
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
 * Deliberately boring body: synchronous transform, byte-preserved
 * passthrough when nothing applies.
 */

interface DesignToolLoaderContext {
  resourcePath?: string;
  query?: string | Record<string, unknown>;
  getOptions?: () => Record<string, unknown>;
  callback?: (error: Error | null, content?: string | Buffer) => void;
  rootContext?: string;
}

interface LoaderOptions {
  root?: string;
  pagesDir?: string;
}

const { transformNextModuleSource } = require("./loader.ts") as {
  transformNextModuleSource: (
    source: string,
    moduleId: string,
    options?: { root?: string; pagesDir?: string },
  ) => { code: string } | null;
};
const { extractComponentContracts } = require("@design-tool/plugin/component-contracts") as {
  extractComponentContracts: (source: string, file: string) => unknown[];
};

const nodePath = require("node:path");
const nodeFs = require("node:fs");

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
    const raw = JSON.parse(
      nodeFs.readFileSync(nodePath.join(root, ".next", "design-tool-sidecar.json"), "utf8"),
    ) as { port?: number };
    port = typeof raw.port === "number" ? raw.port : 0;
  } catch {
    return;
  }
  if (!port) return;
  const body = JSON.stringify({ file: relativeFile, contracts });
  void fetch(`http://127.0.0.1:${port}/__design_tool__/contracts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).catch(() => {});
}

function readOptions(context: DesignToolLoaderContext): LoaderOptions {
  if (typeof context.getOptions === "function") {
    return context.getOptions() as LoaderOptions;
  }
  // Older/Turbopack-subset contexts may expose webpack's legacy `query`.
  if (context.query && typeof context.query === "object") {
    return context.query as LoaderOptions;
  }
  return {};
}

function designToolLoader(
  this: DesignToolLoaderContext,
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

  // Contracts are extracted from the AUTHORED source so line/column
  // provenance matches what prompts will name.
  if (root && moduleId) {
    const normalized = moduleId.split("\\").join("/");
    const rootPrefix = root.endsWith("/") ? root : `${root}/`;
    // Confined to first-party sources exactly like identity injection:
    // workspace tooling components must never enter the contract catalog.
    if (normalized.startsWith(rootPrefix)) {
      const relativeFile = normalized.slice(rootPrefix.length);
      try {
        postContracts(root, relativeFile, source);
      } catch {
        /* never break compilation for knowledge transport */
      }
    }
  }

  const result = transformNextModuleSource(source, moduleId, {
    root,
    pagesDir: options.pagesDir,
  });

  if (!result) {
    // Byte-preservation contract: untouched modules fall through unchanged.
    return source;
  }

  this.callback?.(null, result.code);
  return undefined;
}

module.exports = designToolLoader;
