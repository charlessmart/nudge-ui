/**
 * Small cross-platform project watcher for the standalone host.
 *
 * Node's recursive fs.watch option is not available on every supported
 * platform, so this Module watches each project directory and adds watches
 * for directories created later. The public Interface exposes only lifecycle
 * and settled batches; debounce and symlink confinement stay internal.
 */
import { watch, type FSWatcher } from "node:fs";
import { readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  "build",
  "dist",
  "node_modules",
]);

export type StandaloneFileChangeKind = "add" | "change" | "remove";

export interface StandaloneFileChange {
  readonly absolutePath: string;
  readonly kind: StandaloneFileChangeKind;
}

export interface StandaloneFileWatcherOptions {
  readonly rootDirectory: string;
  readonly debounceMs?: number;
  readonly onSettled: (changes: readonly StandaloneFileChange[]) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}

export interface StandaloneFileWatcher {
  start(): void;
  close(): Promise<void>;
}

interface DirectoryWatch {
  readonly directory: string;
  readonly canonicalDirectory: string;
  readonly watcher: FSWatcher;
}

/** Creates a watcher that starts and stops explicitly with the server. */
export function createStandaloneFileWatcher(
  options: StandaloneFileWatcherOptions,
): StandaloneFileWatcher {
  const rootDirectory = realpathSync(resolve(options.rootDirectory));
  const debounceMs = Math.max(0, options.debounceMs ?? 60);
  const watches = new Map<string, DirectoryWatch>();
  const pending = new Map<string, StandaloneFileChangeKind>();
  let timer: NodeJS.Timeout | null = null;
  let started = false;
  let closed = false;

  const reportError = (error: unknown): void => {
    options.onError?.(error);
  };

  const schedule = (absolutePath: string, wasRenamed = false): void => {
    if (closed || !isProjectPath(rootDirectory, absolutePath)) return;
    const kind = classifyChange(absolutePath, wasRenamed);
    const existing = pending.get(absolutePath);
    pending.set(absolutePath, mergeChangeKind(existing, kind));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const flush = (): void => {
    timer = null;
    if (closed || pending.size === 0) return;
    const changes = [...pending.entries()]
      .sort(([a], [b]) => comparePosixStrings(a, b))
      .map(([absolutePath, kind]) => ({ absolutePath, kind }));
    pending.clear();
    void Promise.resolve(options.onSettled(changes)).catch(reportError);
  };

  const closeDirectory = (directory: string): void => {
    const entry = watches.get(directory);
    if (!entry) return;
    watches.delete(directory);
    entry.watcher.close();
  };

  const closeDescendants = (directory: string): void => {
    for (const watchedDirectory of [...watches.keys()]) {
      if (watchedDirectory === directory || watchedDirectory.startsWith(`${directory}${sep}`)) {
        closeDirectory(watchedDirectory);
      }
    }
  };

  const watchDirectory = (directory: string): void => {
    if (closed || !isProjectDirectory(rootDirectory, directory)) return;
    const canonicalDirectory = canonicalProjectPath(rootDirectory, directory);
    if (!canonicalDirectory || [...watches.values()].some(
      (entry) => entry.canonicalDirectory === canonicalDirectory,
    )) return;

    let directoryWatcher: FSWatcher;
    try {
      directoryWatcher = watch(directory, { persistent: true }, (eventType, filename) => {
        const changedName = filename?.toString();
        const changedPath = changedName ? join(directory, changedName) : directory;
        if (!isProjectPath(rootDirectory, changedPath)) return;

        if (isProjectDirectory(rootDirectory, changedPath)) watchDirectory(changedPath);
        else if (!exists(changedPath)) closeDescendants(changedPath);
        schedule(changedPath, eventType === "rename");
      });
      directoryWatcher.on("error", reportError);
    } catch (error) {
      reportError(error);
      return;
    }

    watches.set(directory, { directory, canonicalDirectory, watcher: directoryWatcher });
    let entries: string[];
    try {
      entries = readdirSync(directory).sort(comparePosixStrings);
    } catch {
      return;
    }
    for (const name of entries) {
      const child = join(directory, name);
      if (isProjectDirectory(rootDirectory, child)) watchDirectory(child);
    }
  };

  return {
    start: () => {
      if (started || closed) return;
      started = true;
      watchDirectory(rootDirectory);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
      for (const directory of [...watches.keys()]) closeDirectory(directory);
    },
  };
}

function mergeChangeKind(
  previous: StandaloneFileChangeKind | undefined,
  next: StandaloneFileChangeKind,
): StandaloneFileChangeKind {
  if (!previous) return next;
  if (next === "remove") return "remove";
  if (next === "add") return previous === "remove" ? "add" : previous;
  if (previous === "remove") return "change";
  return "change";
}

function classifyChange(absolutePath: string, wasRenamed: boolean): StandaloneFileChangeKind {
  if (!exists(absolutePath)) return "remove";
  return wasRenamed ? "add" : "change";
}

function exists(path: string): boolean {
  try {
    return statSync(path).isFile() || statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isProjectDirectory(rootDirectory: string, path: string): boolean {
  if (!isProjectPath(rootDirectory, path) || isExcludedDirectory(rootDirectory, path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isProjectPath(rootDirectory: string, path: string): boolean {
  if (!isWithin(rootDirectory, resolve(path)) || isExcludedDirectory(rootDirectory, path)) return false;
  return canonicalProjectPath(rootDirectory, path) !== null;
}

function canonicalProjectPath(rootDirectory: string, path: string): string | null {
  try {
    const canonical = realpathSync(path);
    return isWithin(rootDirectory, canonical) ? canonical : null;
  } catch {
    const parent = dirname(path);
    if (parent === path) return null;
    try {
      const canonicalParent = realpathSync(parent);
      return isWithin(rootDirectory, canonicalParent) ? canonicalParent : null;
    } catch {
      return null;
    }
  }
}

function isExcludedDirectory(rootDirectory: string, path: string): boolean {
  return relative(rootDirectory, resolve(path)).split(sep).some((segment) =>
    EXCLUDED_DIRECTORY_NAMES.has(segment));
}

function isWithin(rootDirectory: string, candidate: string): boolean {
  const pathFromRoot = relative(rootDirectory, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`)
      && pathFromRoot !== ".."
      && !isAbsolute(pathFromRoot));
}

/** Compares UTF-8 path bytes so ordering does not depend on the host locale. */
function comparePosixStrings(a: string, b: string): number {
  return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8"));
}
