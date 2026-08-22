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
  const options = readOptions(this);
  const moduleId = this.resourcePath ?? "";
  const result = transformNextModuleSource(source, moduleId, {
    root: options.root ?? this.rootContext,
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
