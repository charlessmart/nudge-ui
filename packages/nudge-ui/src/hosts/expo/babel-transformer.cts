/** Metro `require`s its Babel transformer inside transform workers, so this is CommonJS and bundled to `dist/` like the Next.js loaders. */

/** The fields of Metro's transformer arguments this wrapper reads; the rest travel with the object to the upstream transformer. */
interface MetroBabelTransformerArgs {
  readonly filename: string;
  readonly src: string;
  readonly options: {
    readonly dev: boolean;
    readonly platform: string | null;
    readonly projectRoot: string;
    readonly customTransformOptions?: { readonly environment?: string };
  };
}

/** Metro's Babel transformer contract; results are handed back to Metro untouched. */
interface MetroBabelTransformer {
  transform(args: MetroBabelTransformerArgs): object;
  getCacheKey?(options?: MetroCacheKeyOptions): string;
}

/** What Metro passes when it asks a transformer for its cache key. */
interface MetroCacheKeyOptions {
  readonly projectRoot?: string;
  readonly enableBabelRCLookup?: boolean;
}

// SAFETY: `typeof import(...)` derives the asserted shape from the module's own declaration, so the required exports cannot drift.
const {
  EXPO_TRANSFORM_SETTINGS_ENV,
  EXPO_UPSTREAM_TRANSFORMER_ENV,
  readExpoTransformSettings,
  transformExpoModuleSource,
} = require("./transform.ts") as typeof import("./transform.ts");
// SAFETY: `typeof import(...)` derives the asserted shape from the built-in module's own declaration.
const { createRequire } = require("node:module") as typeof import("node:module");
// SAFETY: `typeof import(...)` derives the asserted shape from the built-in module's own declaration.
const { join } = require("node:path") as typeof import("node:path");

/** Bumped when the instrumentation output changes, so Metro's transform cache never serves a stale shape. */
const INSTRUMENTATION_VERSION = "expo-2";

let upstream: MetroBabelTransformer | null = null;

/** The project's own transformer, or Expo's default resolved from the project so its Babel preset matches the app's. */
function upstreamTransformer(projectRoot: string): MetroBabelTransformer {
  if (upstream) return upstream;
  const configured = process.env[EXPO_UPSTREAM_TRANSFORMER_ENV];
  const projectRequire = createRequire(join(projectRoot, "package.json"));
  const path = configured ?? projectRequire.resolve("@expo/metro-config/babel-transformer");
  // SAFETY: Metro's Babel transformer contract: a module exporting `transform` and optionally `getCacheKey`.
  upstream = projectRequire(path) as MetroBabelTransformer;
  return upstream;
}

const settings = readExpoTransformSettings();

const transformer: MetroBabelTransformer = {
  transform(args) {
    const next = upstreamTransformer(args.options.projectRoot);
    if (!settings) return next.transform(args);
    let source: string | null = null;
    try {
      source = transformExpoModuleSource(args.src, args.filename, {
        dev: args.options.dev,
        platform: args.options.platform,
        environment: typeof args.options.customTransformOptions?.environment === "string"
          ? args.options.customTransformOptions.environment
          : undefined,
      }, settings);
    } catch {
      // Identity is a development aid; a file it cannot read still compiles as authored.
      source = null;
    }
    return next.transform(source === null ? args : { ...args, src: source });
  },
  getCacheKey(options) {
    const next = upstreamTransformer(settings?.root ?? process.cwd());
    return [
      next.getCacheKey ? next.getCacheKey(options) : "",
      INSTRUMENTATION_VERSION,
      process.env[EXPO_TRANSFORM_SETTINGS_ENV] ?? "off",
    ].join("\0");
  },
};

module.exports = transformer;
