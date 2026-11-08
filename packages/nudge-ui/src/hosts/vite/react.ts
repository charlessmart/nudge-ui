import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Alias } from "vite";
import { injectIdentity } from "../../compiler/reactIdentity.ts";
import { extractComponentCatalog } from "../../compiler/componentContracts.ts";
import {
  collectPackageComponentImports,
  extractPackageComponentContractCatalog,
  type PackageComponentImport,
} from "../../compiler/packageComponentContracts.ts";
import { mergeComponentContracts } from "../../compiler/projectComponentContracts.ts";
import type { ComponentContract } from "../../compiler/index.ts";
import { createTypeAwareContracts } from "./typeAwareContracts.ts";
import type { NudgeUiRuntimeConfig } from "../../inspector/clientManifest.ts";
import { COMPONENT_SHEET_RUNTIME_MODULE as COMPONENT_SHEET_RUNTIME_MODULE_ID } from "./componentSheet.ts";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "../reactRendererCapture.ts";
import {
  defaultReactComponentProtocols,
  formatComponentPolicyWarning,
  groupComponentPolicyDiagnostics,
  mergeComponentModuleProtocols,
  resolveHostComponentPolicy,
  type ComponentInstrumentationOptions,
  type ComponentModuleProtocols,
} from "../../compiler/index.ts";

const COMPONENT_EXTENSION = /\.(?:tsx|jsx)(?:$|[?#])/;
const COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";
const COMPONENT_SHEET_RUNTIME_MODULE = COMPONENT_SHEET_RUNTIME_MODULE_ID;

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

/** Cheap change detector: observing an unchanged module must not queue a checker pass. */
function fingerprintSource(code: string): string {
  let hash = 5381;
  for (let index = 0; index < code.length; index++) hash = ((hash << 5) + hash + code.charCodeAt(index)) | 0;
  return `${code.length}:${hash}`;
}

export function createReactSupport(options: ReactOptions, host: FrameworkHost) {
  const contractsByFile = new Map<string, ComponentContract[]>();
  const wrapperIdsByFile = new Map<string, readonly string[]>();
  const packageImportsByFile = new Map<string, PackageComponentImport[]>();
  const reportedPolicyDiagnostics = new Set<string>();
  const manualComponentIds = new Set(
    options.componentMetadata?.map((contract) => contract.componentId) ?? [],
  );
  let packageFingerprint = "";
  const observedSources = new Map<string, string>();
  let typeAwareContracts = new Map<string, ComponentContract>();
  let contractsListener: (() => void) | null = null;
  const typeAware = options.typeAwareComponents === false
    ? null
    : createTypeAwareContracts({
      root: () => host.root(),
      files: () => [...observedSources.keys()],
      catalogPath: (file) => host.catalogPath(file),
      warn: (message) => console.warn(message),
      onChange(contracts) {
        typeAwareContracts = new Map(contracts);
        contractsListener?.();
      },
    });

  // Aliased so the injected specifier resolves in a packed install, where the application's graph has never heard of it.
  const componentRuntimePath = resolveComponentRuntime();
  const componentSheetPath = resolvePackageModule(COMPONENT_SHEET_RUNTIME_MODULE);

  if (options.componentMetadata?.length) {
    contractsByFile.set("package-manifests", options.componentMetadata.map((contract) => ({
      ...contract,
      provenance: "package-manifest",
    })));
  }

  /** Fingerprinted on the rendered package exports, so an unchanged import graph costs nothing. */
  function refreshPackageContracts(): void {
    const importsByKey = new Map<string, PackageComponentImport>();
    for (const imports of packageImportsByFile.values()) {
      for (const packageImport of imports) {
        importsByKey.set(`${packageImport.moduleSpecifier}#${packageImport.exportName}`, packageImport);
      }
    }
    const fingerprint = [...importsByKey.keys()].sort().join("\n");
    if (fingerprint === packageFingerprint) return;

    for (const key of [...contractsByFile.keys()]) {
      if (key.startsWith("package-types:")) contractsByFile.delete(key);
    }
    const root = host.root();
    const catalog = root
      ? extractPackageComponentContractCatalog({
        hostFile: join(root, "__nudge_ui_package_contracts__.tsx"),
        imports: [...importsByKey.values()],
      })
      : [];
    const moduleSpecifiers = new Set([...importsByKey.values()].map((entry) => entry.moduleSpecifier));
    for (const moduleSpecifier of moduleSpecifiers) {
      contractsByFile.set(
        `package-types:${moduleSpecifier}`,
        catalog.filter((contract) =>
          contract.file === moduleSpecifier && !manualComponentIds.has(contract.componentId)),
      );
    }
    packageFingerprint = fingerprint;
  }

  return {
    hostLabel: "vite-react" as const satisfies NudgeUiRuntimeConfig["host"],
    framework: "React" as const satisfies NudgeUiRuntimeConfig["framework"],
    virtualModuleId: "virtual:nudge-ui-components",
    /** Lets live preview reach React's renderer, which loads before any module the host controls. */
    documentHeadScript: REACT_RENDERER_CAPTURE_SCRIPT,

    owns(id: string): boolean {
      return COMPONENT_EXTENSION.test(id);
    },

    /** Dedupe is load-bearing: instrumented callsites must use the application's own React, not a linked or nested copy. */
    viteConfig(context: { projectRoot: string; demo: boolean; existingDedupe: readonly string[] }) {
      const demoAliases = context.demo && options.skipReactAliases !== true
        ? resolveReactAliases(context.projectRoot)
        : [];
      const runtimeAliases: Alias[] = [
        ...(componentRuntimePath
          ? [{ find: COMPONENT_RUNTIME_MODULE, replacement: componentRuntimePath }]
          : []),
        ...(componentSheetPath
          ? [{ find: COMPONENT_SHEET_RUNTIME_MODULE, replacement: componentSheetPath }]
          : []),
      ];
      return {
        ...(componentRuntimePath
          ? {
            // Vite merges this with the application's own settings, so listing its entries here would duplicate them.
            optimizeDeps: {
              include: [
                COMPONENT_RUNTIME_MODULE,
                ...(componentSheetPath ? [COMPONENT_SHEET_RUNTIME_MODULE] : []),
              ],
            },
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
      typeAware?.refresh();
    },

    /** Notified when the asynchronous checker pass changes what `contracts()` returns. */
    onContractsChanged(listener: () => void): void {
      contractsListener = listener;
    },

    dispose(): void {
      typeAware?.dispose();
    },

    observe(id: string, code: string, refreshPackages = true): void {
      if (!COMPONENT_EXTENSION.test(id) || !host.isHostSource(id)) return;
      const fileId = id.split(/[?#]/, 1)[0] ?? id;
      const catalog = extractComponentCatalog(code, host.catalogPath(fileId));
      contractsByFile.set(fileId, catalog.contracts);
      wrapperIdsByFile.set(fileId, catalog.wrapperIds);
      const fingerprint = fingerprintSource(code);
      const changed = observedSources.get(fileId) !== fingerprint;
      observedSources.set(fileId, fingerprint);
      if (changed && refreshPackages) typeAware?.schedule();
      packageImportsByFile.set(fileId, collectPackageComponentImports(code, fileId));
      if (refreshPackages) refreshPackageContracts();
    },

    forget(id: string): void {
      contractsByFile.set(id, []);
      wrapperIdsByFile.delete(id);
      packageImportsByFile.delete(id);
      if (observedSources.delete(id)) typeAware?.schedule();
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
      const syntactic = [...contractsByFile.values()].flat();
      if (typeAwareContracts.size === 0) return syntactic;
      // Checker-only components (props from `PropsWithChildren`, imported types) still get the parser's role.
      const wrapperIds = new Set([...wrapperIdsByFile.values()].flat());
      return mergeComponentContracts(syntactic, typeAwareContracts, manualComponentIds)
        .map((contract) => contract.role || !wrapperIds.has(contract.componentId) ? contract : { ...contract, role: "wrapper" as const });
    },

    serializeVirtualModule(contracts: readonly ComponentContract[]): string {
      return `export const componentContracts = ${JSON.stringify(contracts)};\n`
        + "export default componentContracts;\n";
    },
  };
}

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
  return resolvePackageModule(COMPONENT_RUNTIME_MODULE);
}

function resolvePackageModule(specifier: string): string | null {
  try {
    return packageRequire.resolve(specifier);
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
