import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { ComponentContract } from "../../compiler/index.ts";
import { stylingSystemLabel } from "../../css/dialects/index.ts";
import {
  createNudgeUiClientManifest,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "../../inspector/clientManifest.ts";
import { createProjectFileWatcher, type ProjectFileChange } from "../../project/files.ts";
import { createProjectId } from "../../project/identity.ts";
import { createReloadStream, createReservedRoutes } from "../../project/routes.ts";
import { createProjectTokenSnapshot, type ProjectTokenSnapshot } from "../../project/tokens.ts";
import { NUDGE_UI_RELOAD_PATH } from "../../transport/index.ts";
import { createComponentCatalog } from "../componentFramework/catalog.ts";
import { createReactNativeComponentFramework } from "../componentFramework/reactNative.ts";
import { automationManifestFields } from "../environment.ts";
import { isExpoProjectSource, type ExpoTransformSettings } from "./transform.ts";

export type ConnectNext = (error?: Error) => void;
export type ConnectMiddleware = (request: IncomingMessage, response: ServerResponse, next: ConnectNext) => void;

export interface ExpoDevServerOptions {
  readonly settings: ExpoTransformSettings;
  readonly typeAwareComponents?: boolean;
  readonly componentMetadata?: readonly ComponentContract[];
}

export interface ExpoDevServer {
  /** Answers reserved routes and the editor document; everything else goes to `next`. */
  readonly middleware: ConnectMiddleware;
  manifest(): NudgeUiClientManifest;
  close(): Promise<void>;
}

const SCAN_MAX_SOURCES = 5000;
const GLOBAL_KEY = Symbol.for("nudge-ui/expo/dev-server");

export function expoProjectId(root: string): string {
  return createProjectId("expo", root);
}

/** Metro evaluates the config more than once per process; one server per root keeps one watcher and one catalog. */
export function ensureExpoDevServer(options: ExpoDevServerOptions): ExpoDevServer {
  // SAFETY: The GLOBAL_KEY symbol names the one global slot this module owns and writes itself.
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, ExpoDevServer> };
  const servers = holder[GLOBAL_KEY] ??= new Map();
  const existing = servers.get(options.settings.root);
  if (existing) return existing;
  const server = createExpoDevServer(options, () => servers.delete(options.settings.root));
  servers.set(options.settings.root, server);
  return server;
}

/** Closes the server `ensureExpoDevServer` made for this root, if any. */
export async function closeExpoDevServer(root: string): Promise<void> {
  // SAFETY: The GLOBAL_KEY symbol names the one global slot this module owns and writes itself.
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, ExpoDevServer> };
  await holder[GLOBAL_KEY]?.get(root)?.close();
}

function createExpoDevServer(options: ExpoDevServerOptions, onClose: () => void): ExpoDevServer {
  const { settings } = options;
  const root = settings.root;
  let generation = 0;
  const reload = createReloadStream(() => generation);
  const framework = createReactNativeComponentFramework(settings.primitiveModules);
  const catalog = createComponentCatalog(framework, {
    root: () => root,
    isHostSource: (file) => isExpoProjectSource(file, settings),
    catalogPath: (file) => relative(root, file).split(sep).join("/"),
    warn: (message) => console.warn(message),
  }, {
    ...(options.componentMetadata ? { componentMetadata: options.componentMetadata } : {}),
    typeAware: options.typeAwareComponents !== false,
    maxScannedFiles: SCAN_MAX_SOURCES,
    ignoredDirectories: [".expo", "ios", "android", "dist", "web-build"],
  });

  let tokens: ProjectTokenSnapshot | null = null;
  const runtime = (): NudgeUiRuntimeConfig => ({
    projectId: expoProjectId(root),
    host: "expo",
    framework: "React Native",
    stylingSystem: stylingSystemLabel(tokens?.stylingDialects ?? []),
    stylingDialects: tokens?.stylingDialects ?? [],
    capabilities: { componentSemantics: true },
    tokenCatalog: tokens?.tokenCatalog ?? [],
    tokens: tokens?.tokens ?? [],
    tokenDiagnostics: tokens?.tokenDiagnostics ?? [],
    tokenGeneration: tokens?.tokenGeneration ?? "",
    componentContracts: catalog.contracts(),
  });
  const manifest = (): NudgeUiClientManifest => createNudgeUiClientManifest({
    runtime: runtime(),
    revision: generation,
    reload: { endpoint: NUDGE_UI_RELOAD_PATH, strategy: "refresh-manifest" },
    ...automationManifestFields(),
  });

  let publishTimer: NodeJS.Timeout | null = null;
  const publish = (): void => {
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      generation += 1;
      reload.publish();
    }, 120);
  };
  catalog.onContractsChanged(publish);

  const tokenOptions = {
    rootDirectory: root,
    generationLabel: "expo-token",
    ...(settings.sourceRoots.length > 0 ? { additionalRootDirectories: [...settings.sourceRoots] } : {}),
  };
  const refreshTokens = async (): Promise<void> => {
    try {
      tokens = await createProjectTokenSnapshot(tokenOptions);
    } catch {
      /* an unreadable tree keeps the previous snapshot */
    }
    publish();
  };

  const observe = (file: string): boolean => {
    try {
      const size = statSync(file).size;
      const source = readFileSync(file, "utf8");
      // Truncate-then-write editors can expose a valid prefix; a later settled batch rereads it.
      if (Buffer.byteLength(source) !== size) return false;
      catalog.observe(file, source);
      return true;
    } catch {
      return false;
    }
  };
  const settle = async (changes: readonly ProjectFileChange[]): Promise<void> => {
    let rescan = false;
    for (const change of changes) {
      const file = change.absolutePath;
      if (!catalog.owns(file)) {
        rescan = true;
        continue;
      }
      if (change.kind === "remove") catalog.forget(file);
      else if (!observe(file)) rescan = true;
    }
    if (rescan) catalog.rescan();
    await refreshTokens();
  };

  const watcher = createProjectFileWatcher({ rootDirectory: root, debounceMs: 60, onSettled: settle });
  const ready = (async () => {
    try {
      catalog.warmUp();
    } catch {
      /* an unreadable tree starts empty and fills from the watcher */
    }
    await refreshTokens();
    await watcher.start();
  })().catch((error) => {
    console.warn(`[nudge-ui] Expo project watcher failed to start: ${String(error)}`);
  });

  const reservedRoutes = createReservedRoutes({
    root: () => root,
    manifest: async () => {
      await ready;
      return manifest();
    },
    reload,
  });

  return {
    middleware(request, response, next) {
      void reservedRoutes(request, response)
        .then((handled) => { if (!handled) next(); })
        .catch((error) => {
          if (response.headersSent) response.destroy();
          else next(error instanceof Error ? error : new Error(String(error)));
        });
    },
    manifest,
    async close() {
      onClose();
      if (publishTimer) clearTimeout(publishTimer);
      reload.close();
      catalog.dispose();
      await watcher.close().catch(() => {});
    },
  };
}

export function resolveSourceRoots(root: string, sourceRoots: readonly string[] | undefined): string[] {
  return (sourceRoots ?? []).map((sourceRoot) => resolve(root, sourceRoot));
}
