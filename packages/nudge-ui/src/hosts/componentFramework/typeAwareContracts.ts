import { relative } from "node:path";
import { Worker } from "node:worker_threads";
import type { ComponentContract } from "../../compiler/index.ts";
import type {
  ProjectContractRequest,
  ProjectContractResponse,
} from "../../compiler/projectComponentContractsWorker.ts";

/** Runs one checker pass; the default implementation lives on a worker thread so the dev server never waits on it. */
export interface ContractRunner {
  run(request: Omit<ProjectContractRequest, "id">): Promise<ComponentContract[]>;
  dispose(): void;
}

export interface TypeAwareContractsOptions {
  root(): string | undefined;
  files(): readonly string[];
  catalogPath(file: string): string;
  /** Called with the full refreshed set only when it differs from the previous one. */
  onChange(contracts: ReadonlyMap<string, ComponentContract>): void;
  warn(message: string): void;
  debounceMs?: number;
  /** The framework's checker pass, normally a worker thread. */
  createRunner: () => ContractRunner;
}

export interface TypeAwareContracts {
  /** Runs now, coalescing with a pass already in flight. */
  refresh(): void;
  /** Runs after the debounce window; later calls inside it restart the timer. */
  schedule(): void;
  dispose(): void;
}

/** Roots beyond this make one program take tens of seconds and gigabytes; 1000 roots measured about 3s and 1 GB. */
export const MAX_TYPE_AWARE_ROOTS = 1500;

const NON_LIBRARY_SOURCE = /(?:^|[\\/])(?:__tests__|__mocks__|fixtures|e2e|\.storybook)(?:[\\/]|$)|\.(?:test|spec|stories)\.[cm]?[jt]sx?$|^nudge\.sheet\.[cm]?[jt]sx?$/;

/** Drops tests, stories and fixtures, then keeps the shallowest files when a project is still too large. */
export function selectTypeAwareRoots(
  files: readonly string[],
  root: string,
  limit = MAX_TYPE_AWARE_ROOTS,
): { roots: string[]; truncated: boolean } {
  // Relative, so a project that itself lives under a folder named `fixtures` is not excluded wholesale.
  const eligible = files.filter((file) => !NON_LIBRARY_SOURCE.test(relative(root, file)));
  if (eligible.length <= limit) return { roots: eligible, truncated: false };
  const depth = (file: string): number => file.split(/[\\/]/).length;
  const roots = eligible
    .map((file, index) => ({ file, index }))
    .sort((left, right) => depth(left.file) - depth(right.file) || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.file);
  return { roots, truncated: true };
}

/** Runs a worker module that answers `ProjectContractRequest` messages; the URL is built lazily by the caller, because CommonJS bundles have no `import.meta.url`. */
export function createWorkerRunner(workerUrl: URL): ContractRunner {
  // A bounded heap turns a runaway program into a worker error, which falls back to syntactic contracts.
  // From source the worker is a .ts module; Node 22 runs one only with type stripping switched on, as Node 23.6+ does by default.
  const needsTypeStripping = workerUrl.pathname.endsWith(".ts") && !(process.features as { typescript?: unknown }).typescript;
  const worker = new Worker(workerUrl, {
    ...(needsTypeStripping ? { execArgv: [...process.execArgv, "--experimental-strip-types"] } : {}),
    resourceLimits: { maxOldGenerationSizeMb: 4096 },
  });
  worker.unref();
  let nextId = 0;
  const pending = new Map<number, { resolve(contracts: ComponentContract[]): void; reject(error: Error): void }>();
  const failAll = (error: Error): void => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  worker.on("message", (message: ProjectContractResponse) => {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if ("error" in message) entry.reject(new Error(message.error));
    else entry.resolve(message.contracts);
  });
  worker.on("error", (error) => failAll(error));
  worker.on("exit", (code) => failAll(new Error(`type-aware contract worker exited with code ${code}`)));
  return {
    run(request) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, ...request } satisfies ProjectContractRequest);
      });
    },
    dispose() {
      failAll(new Error("disposed"));
      void worker.terminate();
    },
  };
}

export function createTypeAwareContracts(options: TypeAwareContractsOptions): TypeAwareContracts {
  const debounceMs = options.debounceMs ?? 300;
  let runner: ContractRunner | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerun = false;
  let failed = false;
  let truncationReported = false;
  let disposed = false;
  let fingerprint = "";

  async function pass(): Promise<void> {
    const root = options.root();
    if (disposed || failed || !root) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      runner ??= options.createRunner();
      const { roots: files, truncated } = selectTypeAwareRoots(options.files(), root);
      if (truncated && !truncationReported) {
        truncationReported = true;
        options.warn(
          `[nudge-ui] Type-aware component contracts cover the ${files.length} shallowest of ${options.files().length} component files.`,
        );
      }
      const catalogPaths = Object.fromEntries(files.map((file) => [file, options.catalogPath(file)]));
      const contracts = await runner.run({ root, files, catalogPaths });
      if (disposed) return;
      const next = JSON.stringify(contracts);
      if (next === fingerprint) return;
      fingerprint = next;
      try {
        options.onChange(new Map(contracts.map((contract) => [contract.componentId, contract])));
      } catch (error) {
        options.warn(`[nudge-ui] Could not apply type-aware contracts: ${String(error)}`);
      }
    } catch (error) {
      if (!disposed && !failed) {
        failed = true;
        options.warn(
          "[nudge-ui] Type-aware component contracts are unavailable; using syntactic contracts. "
          + (error instanceof Error ? error.message.split("\n")[0] : String(error)),
        );
      }
      runner?.dispose();
      runner = null;
    } finally {
      running = false;
      if (rerun && !failed && !disposed) {
        rerun = false;
        void pass();
      }
    }
  }

  return {
    refresh() {
      if (timer) clearTimeout(timer);
      timer = null;
      void pass();
    },
    schedule() {
      if (disposed || failed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void pass();
      }, debounceMs);
      timer.unref?.();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      runner?.dispose();
      runner = null;
    },
  };
}
