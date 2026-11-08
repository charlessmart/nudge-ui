import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import type { ComponentContract, PackageComponentImport } from "../../compiler/index.ts";
import { mergeComponentContracts } from "../../compiler/projectComponentContracts.ts";
import type { ComponentFrameworkAdapter } from "./adapter.ts";
import { createTypeAwareContracts, type TypeAwareContracts } from "./typeAwareContracts.ts";

/** What a catalog asks of its host; paths are absolute file ids unless named otherwise. */
export interface ComponentCatalogHost {
  root(): string | undefined;
  /** Project-owned sources: dependencies, generated output and Nudge's own packages are not. */
  isHostSource(file: string): boolean;
  /** The project-relative path recorded in contracts and diagnostics. */
  catalogPath(file: string): string;
  warn(message: string): void;
}

export interface ComponentCatalogOptions {
  /** Hand-written contracts for packages whose public types cannot describe an editable prop; these win. */
  componentMetadata?: readonly ComponentContract[];
  /** Runs the adapter's checker pass, when it has one. Defaults to true. */
  typeAware?: boolean;
  /** Directories never scanned; dependency and build folders are always skipped. */
  ignoredDirectories?: readonly string[];
  /** Bounds a warm-up scan of a very large tree. */
  maxScannedFiles?: number;
}

/**
 * One framework's component contracts for one project, independent of the bundler that observes its files:
 * per-file syntax, the package types the project renders, and the checker pass, merged in that order.
 */
export interface ComponentCatalog {
  readonly framework: ComponentFrameworkAdapter;
  /** True when the file's extension belongs to the adapter; ownership of the path is the host's call. */
  owns(file: string): boolean;
  /** Reads every adapter source under the root, then runs the package and checker passes. */
  warmUp(): void;
  /**
   * Rereads the tree after an event the host cannot attribute to one file, and forgets sources that are gone.
   * The checker pass is queued only when a source changed.
   */
  rescan(): void;
  /** `refreshPackages` false defers the package and checker passes, for callers observing many files at once. */
  observe(file: string, code: string, refreshPackages?: boolean): void;
  forget(file: string): void;
  contracts(): ComponentContract[];
  /** Called when an asynchronous pass changes what `contracts()` returns; synchronous `observe` calls do not notify. */
  onContractsChanged(listener: () => void): void;
  dispose(): void;
}

const ALWAYS_SKIPPED = new Set(["node_modules", ".git", ".next", ".nudge", "build"]);
const PACKAGE_MANIFESTS_KEY = "package-manifests";
const PACKAGE_TYPES_PREFIX = "package-types:";

/** Cheap change detector: observing an unchanged module must not queue a checker pass. */
function fingerprintSource(code: string): string {
  let hash = 5381;
  for (let index = 0; index < code.length; index++) hash = ((hash << 5) + hash + code.charCodeAt(index)) | 0;
  return `${code.length}:${hash}`;
}

function stripQuery(id: string): string {
  return id.split(/[?#]/, 1)[0] ?? id;
}

export function createComponentCatalog(
  framework: ComponentFrameworkAdapter,
  host: ComponentCatalogHost,
  options: ComponentCatalogOptions = {},
): ComponentCatalog {
  const contractsByFile = new Map<string, ComponentContract[]>();
  const wrapperIdsByFile = new Map<string, readonly string[]>();
  const packageImportsByFile = new Map<string, PackageComponentImport[]>();
  const manualComponentIds = new Set(options.componentMetadata?.map((contract) => contract.componentId) ?? []);
  const observedSources = new Map<string, string>();
  let packageFingerprint = "";
  let typeAwareContracts = new Map<string, ComponentContract>();
  let listener: (() => void) | null = null;

  const typeAware: TypeAwareContracts | null = options.typeAware === false || !framework.createTypeAwareRunner
    ? null
    : createTypeAwareContracts({
      root: () => host.root(),
      files: () => [...observedSources.keys()],
      catalogPath: (file) => host.catalogPath(file),
      warn: (message) => host.warn(message),
      createRunner: () => framework.createTypeAwareRunner!(),
      onChange(contracts) {
        typeAwareContracts = new Map(contracts);
        listener?.();
      },
    });

  if (options.componentMetadata?.length) {
    contractsByFile.set(PACKAGE_MANIFESTS_KEY, options.componentMetadata.map((contract) => ({
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
      if (key.startsWith(PACKAGE_TYPES_PREFIX)) contractsByFile.delete(key);
    }
    const root = host.root();
    const catalog = root
      ? framework.extractPackageContracts(join(root, "__nudge_ui_package_contracts__.tsx"), [...importsByKey.values()])
      : [];
    const moduleSpecifiers = new Set([...importsByKey.values()].map((entry) => entry.moduleSpecifier));
    for (const moduleSpecifier of moduleSpecifiers) {
      contractsByFile.set(
        `${PACKAGE_TYPES_PREFIX}${moduleSpecifier}`,
        catalog.filter((contract) =>
          contract.file === moduleSpecifier && !manualComponentIds.has(contract.componentId)),
      );
    }
    packageFingerprint = fingerprint;
  }

  function scanSources(rootDir: string): { files: string[]; truncated: boolean } {
    const files: string[] = [];
    const ignored = new Set(options.ignoredDirectories ?? []);
    const limit = options.maxScannedFiles ?? Number.POSITIVE_INFINITY;
    const visit = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir).sort();
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files.length >= limit) return;
        if (ALWAYS_SKIPPED.has(entry) || entry.startsWith("dist")) continue;
        const full = join(dir, entry);
        try {
          if (statSync(full).isDirectory()) {
            if (!ignored.has(full)) visit(full);
          } else if (framework.sourceFile.test(entry)) {
            files.push(full);
          }
        } catch {
          // ignore unreadable entries
        }
      }
    };
    visit(rootDir);
    const truncated = files.length >= limit;
    if (truncated) {
      host.warn(`[nudge-ui] Component contract scan stopped at ${limit} sources; later files are read when they compile.`);
    }
    return { files, truncated };
  }

  /** Observes every source under the root; true when any source was added, changed or forgotten. */
  function sync(): boolean {
    const root = host.root();
    if (!root) return false;
    const before = new Map(observedSources);
    const { files, truncated } = scanSources(root);
    for (const file of files) {
      try {
        catalog.observe(file, readFileSync(file, "utf8"), false);
      } catch {
        // skip unreadable component sources
      }
    }
    let changed = false;
    if (!truncated) {
      const scanned = new Set(files);
      const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
      for (const file of before.keys()) {
        if (!scanned.has(file) && file.startsWith(prefix)) {
          forgetFile(file);
          changed = true;
        }
      }
    }
    refreshPackageContracts();
    return changed
      || observedSources.size !== before.size
      || [...observedSources].some(([file, fingerprint]) => before.get(file) !== fingerprint);
  }

  function forgetFile(file: string): void {
    contractsByFile.delete(file);
    wrapperIdsByFile.delete(file);
    packageImportsByFile.delete(file);
    observedSources.delete(file);
  }

  const catalog: ComponentCatalog = {
    framework,

    owns(file) {
      return framework.sourceFile.test(file);
    },

    warmUp() {
      if (!host.root()) return;
      sync();
      typeAware?.refresh();
    },

    rescan() {
      if (sync()) typeAware?.schedule();
    },

    observe(id, code, refreshPackages = true) {
      if (!framework.sourceFile.test(id) || !host.isHostSource(id)) return;
      const file = stripQuery(id);
      const parsed = framework.extractFileContracts(code, host.catalogPath(file));
      contractsByFile.set(file, parsed.contracts);
      wrapperIdsByFile.set(file, parsed.wrapperIds);
      const fingerprint = fingerprintSource(code);
      const changed = observedSources.get(file) !== fingerprint;
      observedSources.set(file, fingerprint);
      if (changed && refreshPackages) typeAware?.schedule();
      packageImportsByFile.set(file, framework.collectPackageImports(code, file));
      if (refreshPackages) refreshPackageContracts();
    },

    forget(id) {
      const file = stripQuery(id);
      const known = observedSources.has(file);
      forgetFile(file);
      if (known) typeAware?.schedule();
      refreshPackageContracts();
    },

    contracts() {
      const syntactic = [...contractsByFile.values()].flat();
      if (typeAwareContracts.size === 0) return syntactic;
      // Checker-only components (props from `PropsWithChildren`, imported types) still get the parser's role.
      const wrapperIds = new Set([...wrapperIdsByFile.values()].flat());
      return mergeComponentContracts(syntactic, typeAwareContracts, manualComponentIds)
        .map((contract) => contract.role || !wrapperIds.has(contract.componentId)
          ? contract
          : { ...contract, role: "wrapper" as const });
    },

    onContractsChanged(next) {
      listener = next;
    },

    dispose() {
      typeAware?.dispose();
    },
  };
  return catalog;
}
