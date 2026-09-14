import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Alias } from "vite";
import { injectIdentity } from "../../compiler/reactIdentity.ts";
import { extractComponentContracts } from "../../compiler/componentContracts.ts";
import {
  collectPackageComponentModules,
  extractPackageComponentContractCatalog,
} from "../../compiler/packageComponentContracts.ts";
import type { ComponentContract } from "../../compiler/index.ts";
import type { NudgeUiRuntimeConfig } from "../../inspector/clientManifest.ts";
import {
  defaultReactComponentProtocols,
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  mergeComponentModuleProtocols,
  resolveHostComponentPolicy,
  type ComponentInstrumentationOptions,
  type ComponentModuleProtocols,
} from "../../compiler/index.ts";

/**
 * What React means to a host, with no knowledge of which host is asking. The
 * Vite host owns the build tool; this module owns React semantics. `FrameworkHost`
 * is everything React needs back, and the Vite host accepts `null` in its place,
 * which is what proves it does not secretly depend on any of this.
 */

const COMPONENT_EXTENSION = /\.(?:tsx|jsx)(?:$|[?#])/;
const COMPONENT_RUNTIME_MODULE = "nudge-ui/component-runtime";

const packageRequire = createRequire(import.meta.url);

export interface ReactOptions {
  /**
   * Skip the React aliases used only by the legacy bundled landing demo.
   * @deprecated Normal development clients no longer add React aliases.
   */
  skipReactAliases?: boolean;
  /** Fills gaps for packages whose public type graph cannot describe an editable prop. */
  componentMetadata?: ComponentContract[];
  /** Package imports are fail-closed unless listed here or described by a component protocol. */
  compatibleComponentImports?: ComponentInstrumentationOptions["compatibleComponentImports"];
  /** Additional package or project component protocols resolved by the host. */
  componentProtocols?: ComponentModuleProtocols;
}

/** Everything React needs from whichever host is driving it. */
export interface FrameworkHost {
  root(): string | undefined;
  /** True when a module belongs to the application rather than a dependency. */
  isHostSource(id: string): boolean;
  /** The project-relative path recorded in contracts and diagnostics. */
  catalogPath(id: string): string;
}

/** The parts of a transform hook React uses, named without the build tool. */
export interface FrameworkTransformContext {
  resolve(specifier: string, importer: string): Promise<string | null>;
  warn(message: string): void;
}

export function createReactSupport(options: ReactOptions, host: FrameworkHost) {
  const contractsByFile = new Map<string, ComponentContract[]>();
  const packageModulesByFile = new Map<string, string[]>();
  const reportedPolicyDiagnostics = new Set<string>();
  const manualComponentIds = new Set(
    options.componentMetadata?.map((contract) => contract.componentId) ?? [],
  );
  let packageFingerprint = "";

  // Aliased so the injected specifier resolves in a packed install, where the
  // application's dependency graph has never heard of it.
  const componentRuntimePath = resolveComponentRuntime();

  if (options.componentMetadata?.length) {
    contractsByFile.set("package-manifests", options.componentMetadata.map((contract) => ({
      ...contract,
      provenance: "package-manifest",
    })));
  }

  /**
   * Fingerprinted on the module-to-importer mapping so an unchanged import
   * graph costs nothing; every component edit reaches this path.
   */
  function refreshPackageContracts(): void {
    const hostByModule = new Map<string, string>();
    for (const [hostFile, modules] of [...packageModulesByFile].sort(([left], [right]) =>
      left.localeCompare(right))) {
      for (const moduleSpecifier of modules) {
        if (!hostByModule.has(moduleSpecifier)) hostByModule.set(moduleSpecifier, hostFile);
      }
    }
    const fingerprint = [...hostByModule]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([moduleSpecifier, hostFile]) => `${moduleSpecifier}\0${hostFile}`)
      .join("\n");
    if (fingerprint === packageFingerprint) return;

    for (const key of [...contractsByFile.keys()]) {
      if (key.startsWith("package-types:")) contractsByFile.delete(key);
    }
    const root = host.root();
    const catalog = root
      ? extractPackageComponentContractCatalog({
        hostFile: join(root, "__nudge_ui_package_contracts__.tsx"),
        moduleSpecifiers: [...hostByModule.keys()],
      })
      : [];
    for (const moduleSpecifier of hostByModule.keys()) {
      contractsByFile.set(
        `package-types:${moduleSpecifier}`,
        catalog.filter((contract) =>
          contract.file === moduleSpecifier && !manualComponentIds.has(contract.componentId)),
      );
    }
    packageFingerprint = fingerprint;
  }

  return {
    /** Manifest labels for a host composing React. */
    hostLabel: "vite-react" as const satisfies NudgeUiRuntimeConfig["host"],
    framework: "React" as const satisfies NudgeUiRuntimeConfig["framework"],
    virtualModuleId: "virtual:nudge-ui-components",

    owns(id: string): boolean {
      return COMPONENT_EXTENSION.test(id);
    },

    /**
     * Dedupe is the load-bearing part: instrumented callsites must use the
     * application's own React, and a linked or nested copy would create a
     * second runtime.
     */
    viteConfig(context: { projectRoot: string; demo: boolean; existingDedupe: readonly string[] }) {
      const demoAliases = context.demo && options.skipReactAliases !== true
        ? resolveReactAliases(context.projectRoot)
        : [];
      const runtimeAliases: Alias[] = componentRuntimePath
        ? [{ find: COMPONENT_RUNTIME_MODULE, replacement: componentRuntimePath }]
        : [];
      return {
        ...(componentRuntimePath
          ? {
            // Vite merges this with the application's own settings, so listing its entries here would duplicate them.
            optimizeDeps: { include: [COMPONENT_RUNTIME_MODULE] },
          }
          : {}),
        resolve: {
          ...(demoAliases.length > 0 || runtimeAliases.length > 0
            ? { alias: [...demoAliases, ...runtimeAliases] }
            : {}),
          dedupe: [...new Set([...context.existingDedupe, "react", "react-dom"])],
        },
      };
    },

    /** Not fatal, but a packed install that cannot resolve it fails later at the importing module. */
    unresolvedRuntimeWarning(): string | null {
      if (componentRuntimePath) return null;
      return `[nudge-ui] Could not resolve ${COMPONENT_RUNTIME_MODULE} from the Vite adapter. `
        + "Semantic component callsites will fall back to application resolution of that specifier.";
    },

    /** Cold-start scan, so the first manifest is not missing every contract. */
    warmUp(): void {
      const root = host.root();
      if (!root) return;
      for (const file of scanComponentFiles(root)) {
        try {
          this.observe(file, readFileSync(file, "utf8"), false);
        } catch {
          // skip unreadable component sources
        }
      }
      refreshPackageContracts();
    },

    observe(id: string, code: string, refreshPackages = true): void {
      if (!COMPONENT_EXTENSION.test(id) || !host.isHostSource(id)) return;
      const fileId = id.split(/[?#]/, 1)[0] ?? id;
      contractsByFile.set(fileId, extractComponentContracts(code, host.catalogPath(fileId)));
      packageModulesByFile.set(fileId, collectPackageComponentModules(code, fileId));
      if (refreshPackages) refreshPackageContracts();
    },

    /** Drops a module whose source could not be read after a change. */
    forget(id: string): void {
      contractsByFile.set(id, []);
      packageModulesByFile.delete(id);
      refreshPackageContracts();
    },

    async transform(
      context: FrameworkTransformContext,
      code: string,
      id: string,
    ): Promise<ReturnType<typeof injectIdentity>> {
      const instrumentComponents = host.isHostSource(id);
      const isComponent = COMPONENT_EXTENSION.test(id) && instrumentComponents;
      if (isComponent) this.observe(id, code);

      const hostPolicy = isComponent
        ? await resolveHostComponentPolicy(code, id, {
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
          moduleProtocols: mergeComponentModuleProtocols(
            defaultReactComponentProtocols,
            options.componentProtocols,
          ),
          compatibleComponentImports: options.compatibleComponentImports,
        })
        : undefined;

      for (const grouped of groupComponentPolicyDiagnostics(hostPolicy?.diagnostics ?? [])) {
        if (reportedPolicyDiagnostics.has(grouped.key)) continue;
        reportedPolicyDiagnostics.add(grouped.key);
        context.warn(formatComponentPolicyWarning(grouped, host.catalogPath(id)));
      }

      return injectIdentity(code, id, host.root(), {
        instrumentComponents,
        // Already folds compatibleComponentImports in, so identity reads one policy.
        hostPolicy,
      });
    },

    contracts(): ComponentContract[] {
      return [...contractsByFile.values()].flat();
    },

    serializeVirtualModule(contracts: readonly ComponentContract[]): string {
      return `export const componentContracts = ${JSON.stringify(contracts)};\n`
        + "export default componentContracts;\n";
    },
  };
}

/** The framework support a host composes, or `null` for no framework at all. */
export type FrameworkSupport = ReturnType<typeof createReactSupport>;

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
      if (statSync(full).isDirectory()) scanComponentFiles(rootDir, files, full);
      else if (COMPONENT_EXTENSION.test(entry)) files.push(full);
    } catch {
      // ignore unreadable entries
    }
  }
  return files;
}

function resolveComponentRuntime(): string | null {
  try {
    return packageRequire.resolve(COMPONENT_RUNTIME_MODULE);
  } catch {
    return null;
  }
}

function resolveReactAliases(projectRoot: string): Alias[] {
  const require = createRequire(`${projectRoot}/package.json`);
  const aliases: Alias[] = [];
  const add = (pattern: RegExp, specifier: string): void => {
    try {
      aliases.push({ find: pattern, replacement: require.resolve(specifier) });
    } catch {
      // an unresolvable specifier simply contributes no alias
    }
  };
  add(/^react$/, "react");
  add(/^react-dom$/, "react-dom");
  add(/^react\/jsx-runtime$/, "react/jsx-runtime");
  add(/^react\/jsx-dev-runtime$/, "react/jsx-dev-runtime");
  add(/^react-dom\/client$/, "react-dom/client");
  return aliases;
}
