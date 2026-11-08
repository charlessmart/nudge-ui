import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Alias } from "vite";
import type { ComponentContract } from "../../compiler/index.ts";
import {
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  mergeComponentModuleProtocols,
  type ComponentInstrumentationOptions,
  type ComponentModuleProtocols,
} from "../../compiler/index.ts";
import type { NudgeUiRuntimeConfig } from "../../inspector/clientManifest.ts";
import type { ComponentFrameworkAdapter, FrameworkInstrumentResult } from "../componentFramework/adapter.ts";
import { createComponentCatalog } from "../componentFramework/catalog.ts";
import { reactComponentFramework } from "../componentFramework/react.ts";

const packageRequire = createRequire(import.meta.url);

export interface ReactOptions {
  /** @deprecated Normal development clients no longer add React aliases. */
  skipReactAliases?: boolean;
  /** Fills gaps for packages whose public type graph cannot describe an editable prop. */
  componentMetadata?: ComponentContract[];
  /** Package imports are fail-closed unless listed here or described by a component protocol. */
  compatibleComponentImports?: ComponentInstrumentationOptions["compatibleComponentImports"];
  componentProtocols?: ComponentModuleProtocols;
  /**
   * Reads project component props through the TypeScript checker (imported props types, enums,
   * `ComponentProps<typeof X>`), off the main thread, and merges them over the syntactic contracts.
   * Defaults to true.
   */
  typeAwareComponents?: boolean;
}

export interface FrameworkHost {
  root(): string | undefined;
  isHostSource(id: string): boolean;
  /** The project-relative path recorded in contracts and diagnostics. */
  catalogPath(id: string): string;
}

export interface FrameworkTransformContext {
  resolve(specifier: string, importer: string): Promise<string | null>;
  warn(message: string): void;
}

/** Labels are per framework because the runtime host string names both the bundler and the framework. */
const VITE_HOST_LABELS: Record<ComponentFrameworkAdapter["id"], NudgeUiRuntimeConfig["host"]> = {
  react: "vite-react",
};

/** The Vite glue around one framework Adapter: aliases, the transform hook and the contracts virtual module. */
export function createViteFrameworkSupport(
  framework: ComponentFrameworkAdapter,
  options: ReactOptions,
  host: FrameworkHost,
) {
  const catalog = createComponentCatalog(framework, {
    root: () => host.root(),
    isHostSource: (id) => host.isHostSource(id),
    catalogPath: (id) => host.catalogPath(id),
    warn: (message) => console.warn(message),
  }, {
    ...(options.componentMetadata ? { componentMetadata: options.componentMetadata } : {}),
    typeAware: options.typeAwareComponents !== false,
  });
  const reportedPolicyDiagnostics = new Set<string>();
  const moduleProtocols = mergeComponentModuleProtocols(framework.defaultProtocols, options.componentProtocols);

  // Aliased so the injected specifiers resolve in a packed install, where the application's graph has never heard of them.
  const runtimeModules = [framework.runtimeModules.components, framework.runtimeModules.sheet]
    .filter((specifier): specifier is string => specifier !== null)
    .map((specifier) => ({ specifier, path: resolvePackageModule(specifier) }));
  const componentRuntimeResolved = runtimeModules[0]?.path !== null;

  return {
    adapter: framework,
    hostLabel: VITE_HOST_LABELS[framework.id],
    framework: framework.label,
    virtualModuleId: "virtual:nudge-ui-components",
    documentHeadScript: framework.documentHeadScript,

    owns(id: string): boolean {
      return catalog.owns(id);
    },

    viteConfig(context: { projectRoot: string; demo: boolean; existingDedupe: readonly string[] }) {
      const demoAliases = context.demo && options.skipReactAliases !== true
        ? resolveSingletonAliases(context.projectRoot, framework.singletonSpecifiers)
        : [];
      const resolvedRuntimes = runtimeModules.filter((entry): entry is { specifier: string; path: string } => entry.path !== null);
      const runtimeAliases: Alias[] = resolvedRuntimes.map((entry) => ({ find: entry.specifier, replacement: entry.path }));
      return {
        ...(componentRuntimeResolved
          ? {
            // Vite merges this with the application's own settings, so listing its entries here would duplicate them.
            optimizeDeps: { include: resolvedRuntimes.map((entry) => entry.specifier) },
          }
          : {}),
        resolve: {
          ...(demoAliases.length > 0 || runtimeAliases.length > 0
            ? { alias: [...demoAliases, ...runtimeAliases] }
            : {}),
          dedupe: [...new Set([...context.existingDedupe, ...framework.singletonPackages])],
        },
      };
    },

    /** Not fatal, but a packed install that cannot resolve it fails later at the importing module. */
    unresolvedRuntimeWarning(): string | null {
      if (componentRuntimeResolved) return null;
      return `[nudge-ui] Could not resolve ${framework.runtimeModules.components} from the Vite adapter. `
        + "Semantic component callsites will fall back to application resolution of that specifier.";
    },

    warmUp(): void {
      catalog.warmUp();
    },

    /** Notified when the asynchronous checker pass changes what `contracts()` returns. */
    onContractsChanged(listener: () => void): void {
      catalog.onContractsChanged(listener);
    },

    dispose(): void {
      catalog.dispose();
    },

    observe(id: string, code: string): void {
      catalog.observe(id, code);
    },

    forget(id: string): void {
      catalog.forget(id);
    },

    async transform(
      context: FrameworkTransformContext,
      code: string,
      id: string,
    ): Promise<FrameworkInstrumentResult | null> {
      const instrumentComponents = host.isHostSource(id);
      const isComponent = catalog.owns(id) && instrumentComponents;
      if (isComponent) catalog.observe(id, code);

      const hostPolicy = isComponent
        ? await framework.resolvePolicy(code, id, {
          resolve: context.resolve,
          read: async (resolvedId) => {
            try {
              return readFileSync(resolvedId, "utf8");
            } catch {
              return null;
            }
          },
          isProjectSource: host.isHostSource,
          sourcePath: host.catalogPath,
        }, {
          moduleProtocols,
          compatibleComponentImports: options.compatibleComponentImports,
        })
        : undefined;

      for (const grouped of groupComponentPolicyDiagnostics(hostPolicy?.diagnostics ?? [])) {
        if (reportedPolicyDiagnostics.has(grouped.key)) continue;
        reportedPolicyDiagnostics.add(grouped.key);
        context.warn(formatComponentPolicyWarning(grouped, host.catalogPath(id)));
      }

      // The policy already folds compatibleComponentImports in, so identity reads one policy.
      return framework.instrument(code, id, host.root(), { instrumentComponents, ...(hostPolicy ? { hostPolicy } : {}) });
    },

    contracts(): ComponentContract[] {
      return catalog.contracts();
    },

    serializeVirtualModule(contracts: readonly ComponentContract[]): string {
      return `export const componentContracts = ${JSON.stringify(contracts)};\n`
        + "export default componentContracts;\n";
    },
  };
}

export type FrameworkSupport = ReturnType<typeof createViteFrameworkSupport>;

/** The React Adapter on Vite: what `nudgeUi()` composes today. */
export function createReactSupport(options: ReactOptions, host: FrameworkHost): FrameworkSupport {
  return createViteFrameworkSupport(reactComponentFramework, options, host);
}

function resolvePackageModule(specifier: string): string | null {
  try {
    return packageRequire.resolve(specifier);
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Exact-match aliases to the project's own copy; an unresolvable specifier contributes none. */
function resolveSingletonAliases(projectRoot: string, specifiers: readonly string[]): Alias[] {
  const require = createRequire(`${projectRoot}/package.json`);
  const aliases: Alias[] = [];
  for (const specifier of specifiers) {
    try {
      aliases.push({ find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement: require.resolve(specifier) });
    } catch {
      // an unresolvable specifier simply contributes no alias
    }
  }
  return aliases;
}
