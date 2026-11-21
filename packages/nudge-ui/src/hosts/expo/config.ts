import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentContract } from "../../compiler/index.ts";
import { REACT_NATIVE_PRIMITIVE_MODULES } from "../componentFramework/reactNative.ts";
import { reactComponentFramework } from "../componentFramework/react.ts";
import { isNudgeUiEnabled } from "../environment.ts";
import { writeExpoBootstrap } from "./bootstrap.ts";
import { ensureExpoDevServer, resolveSourceRoots, type ConnectMiddleware } from "./devServer.ts";
import {
  EXPO_TRANSFORM_SETTINGS_ENV,
  EXPO_UPSTREAM_TRANSFORMER_ENV,
  type ExpoTransformSettings,
} from "./transform.ts";

export interface NudgeUiExpoOptions {
  /** `false` returns the configuration untouched. `NUDGE_UI=0` has the same effect for one run. */
  readonly enabled?: boolean;
  /** Defaults to Metro's `projectRoot`, then the working directory. */
  readonly projectRoot?: string;
  /** Authored workspace directories outside the app root, such as a shared UI package. */
  readonly sourceRoots?: readonly string[];
  /**
   * Modules whose components render platform elements and carry identity through `dataSet`. Defaults to
   * `react-native` and `react-native-web`; add a library whose components forward `dataSet` to a `View`.
   */
  readonly primitiveModules?: readonly string[];
  /** Reads project component props through the TypeScript checker, off the main thread. Defaults to true. */
  readonly typeAwareComponents?: boolean;
  /** Fills gaps for packages whose public type graph cannot describe an editable prop. */
  readonly componentMetadata?: readonly ComponentContract[];
}

/** Metro's resolution result, passed through untouched: a source file, asset files, or an empty module. */
interface MetroResolution {
  readonly type: string;
}
/** The fields of Metro's resolution context this wrapper reads; the rest travel with the object. */
interface MetroResolutionContext {
  readonly originModulePath: string;
  /** Metro's default resolver, which a custom `resolveRequest` calls to avoid recursing into itself. */
  readonly resolveRequest: MetroResolveRequest;
}
type MetroResolveRequest = (context: MetroResolutionContext, moduleName: string, platform: string | null) => MetroResolution;
/** Metro's server instance, which this wrapper only hands on to the project's own enhancer. */
interface MetroServer {
  readonly getBundler?: () => object;
}
type MetroEnhanceMiddleware = (middleware: ConnectMiddleware, server: MetroServer) => ConnectMiddleware;

/**
 * The parts of a Metro config this wrapper reads and replaces; Metro itself is not a dependency. Every other field is
 * carried through by spreading the config the caller passed.
 */
export interface NudgeUiMetroConfig {
  readonly projectRoot?: string;
  readonly watchFolders?: readonly string[];
  readonly transformer?: { readonly babelTransformerPath?: string };
  readonly resolver?: { readonly resolveRequest?: MetroResolveRequest | null };
  readonly serializer?: {
    readonly getPolyfills?: (options: { platform: string | null }) => readonly string[];
    readonly getModulesRunBeforeMainModule?: (entryFilePath: string) => readonly string[];
  };
  readonly server?: { readonly enhanceMiddleware?: MetroEnhanceMiddleware };
}

/** Resolved from the package root so the path is the same from `src/` and `dist/`. */
const PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BABEL_TRANSFORMER = join(PACKAGE_ROOT, "dist", "hosts", "expo", "babel-transformer.cjs");

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isInside(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/**
 * Wraps an Expo Metro config (`getDefaultConfig(__dirname)`) for `expo start`. Outside development, or when disabled,
 * the config is returned untouched, so `expo export` and native release builds receive nothing from Nudge UI.
 */
export function withNudgeUi<T extends object>(config: T, options: NudgeUiExpoOptions = {}): T {
  if (process.env.NODE_ENV !== "development" || !isNudgeUiEnabled(options.enabled)) return config;
  // SAFETY: Consumers pass Metro's real config, of which NudgeUiMetroConfig is the optional subset this wrapper reads;
  // the structural view keeps this package typecheckable without Metro installed.
  const source = config as NudgeUiMetroConfig;
  const root = canonical(options.projectRoot ?? source.projectRoot ?? process.cwd());
  const packageRoot = canonical(PACKAGE_ROOT);
  const sourceRoots = resolveSourceRoots(root, options.sourceRoots).map(canonical);

  let bootstrap: string | null = null;
  try {
    bootstrap = writeExpoBootstrap(root);
  } catch (error) {
    console.warn(`[nudge-ui] Could not write the Expo web bootstrap: ${String(error)}`);
  }

  const settings: ExpoTransformSettings = {
    root,
    sourceRoots,
    packageRoot,
    primitiveModules: options.primitiveModules ?? REACT_NATIVE_PRIMITIVE_MODULES,
    bootstrap,
  };

  // Transform workers inherit the environment; Metro passes them no custom transformer options.
  process.env[EXPO_TRANSFORM_SETTINGS_ENV] = JSON.stringify(settings);
  const upstreamTransformer = source.transformer?.babelTransformerPath;
  if (upstreamTransformer && upstreamTransformer !== BABEL_TRANSFORMER) {
    process.env[EXPO_UPSTREAM_TRANSFORMER_ENV] = upstreamTransformer;
  }

  const server = ensureExpoDevServer({
    settings,
    ...(options.typeAwareComponents === false ? { typeAwareComponents: false } : {}),
    ...(options.componentMetadata ? { componentMetadata: options.componentMetadata } : {}),
  });

  const userEnhance = source.server?.enhanceMiddleware;
  const enhanceMiddleware: MetroEnhanceMiddleware = (metroMiddleware, metroServer) => {
    const inner = userEnhance ? userEnhance(metroMiddleware, metroServer) : metroMiddleware;
    return (request, response, next) => server.middleware(request, response, (error) => {
      if (error) next(error);
      else inner(request, response, next);
    });
  };

  const userPolyfills = source.serializer?.getPolyfills;
  const getPolyfills = (polyfillOptions: { platform: string | null }): readonly string[] => {
    const base = userPolyfills ? userPolyfills(polyfillOptions) : [];
    return polyfillOptions.platform === "web" && bootstrap ? [...base, bootstrap] : base;
  };

  // Expo SDK 54+ answers web polyfill requests itself and ignores the config's `getPolyfills`, so the
  // bootstrap is also registered to run before the main module. The bootstrap returns early without
  // `window` and `document`, so native bundles carry it but never execute it.
  const userRunBeforeMain = source.serializer?.getModulesRunBeforeMainModule;
  const getModulesRunBeforeMainModule = (entryFilePath: string): readonly string[] => {
    const base = userRunBeforeMain ? userRunBeforeMain(entryFilePath) : [];
    return bootstrap ? [...base, bootstrap] : base;
  };

  const userResolveRequest = source.resolver?.resolveRequest ?? null;
  const projectAnchor = join(root, "package.json");
  const singletons = reactComponentFramework.singletonPackages;
  const isSingleton = (name: string): boolean =>
    singletons.some((pkg) => name === pkg || name.startsWith(`${pkg}/`));
  // The component runtime imports React; resolved from Nudge UI's own folder it could load a second copy.
  const resolveRequest: MetroResolveRequest = (context, moduleName, platform) => {
    const fromNudgeUi = isSingleton(moduleName) && isInside(packageRoot, canonical(context.originModulePath));
    const effective = fromNudgeUi ? { ...context, originModulePath: projectAnchor } : context;
    return userResolveRequest
      ? userResolveRequest(effective, moduleName, platform)
      : context.resolveRequest(effective, moduleName, platform);
  };

  const watchFolders = [...(source.watchFolders ?? [])];
  // A workspace link puts Nudge UI outside the project; Metro bundles only files it watches.
  if (!isInside(root, packageRoot) && !watchFolders.some((folder) => isInside(canonical(folder), packageRoot))) {
    watchFolders.push(packageRoot);
  }

  const next: NudgeUiMetroConfig = {
    ...source,
    watchFolders,
    transformer: { ...source.transformer, babelTransformerPath: BABEL_TRANSFORMER },
    resolver: { ...source.resolver, resolveRequest },
    serializer: { ...source.serializer, getPolyfills, getModulesRunBeforeMainModule },
    server: { ...source.server, enhanceMiddleware },
  };
  // SAFETY: `next` spreads every field of the caller's config and replaces only fields Metro defines with compatible values.
  return next as T;
}
