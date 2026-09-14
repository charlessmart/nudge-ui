/**
 * Node's recursive `fs.watch` is not available on every supported platform, so
 * this watches each directory and adds watches for ones created later. The
 * public surface is lifecycle and settled batches; debounce and symlink
 * confinement stay internal.
 */
import { watch, type FSWatcher, type Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isExcludedDirectoryName, isSensitiveProjectPath } from "./pathPolicy.ts";

export { isExcludedDirectoryName, isSensitiveProjectPath } from "./pathPolicy.ts";

export type ProjectFileChangeKind = "add" | "change" | "remove";

export interface ProjectFileChange {
  readonly absolutePath: string;
  readonly kind: ProjectFileChangeKind;
}

export interface ProjectFileWatcherOptions {
  readonly rootDirectory: string;
  readonly debounceMs?: number;
  readonly onSettled: (changes: readonly ProjectFileChange[]) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}

export interface ProjectFileWatcher {
  /** Starts watching and resolves after the initial directory walk is ready. */
  start(): Promise<void>;
  close(): Promise<void>;
}

interface DirectoryWatch {
  readonly directory: string;
  readonly canonicalDirectory: string;
  readonly watcher: FSWatcher;
}

/** Creates a watcher that starts and stops explicitly with the server. */
export function createProjectFileWatcher(
  options: ProjectFileWatcherOptions,
): ProjectFileWatcher {
  const rootDirectory = realpathSync(resolve(options.rootDirectory));
  const debounceMs = Math.max(0, options.debounceMs ?? 60);
  const watches = new Map<string, DirectoryWatch>();
  const pending = new Map<string, ProjectFileChangeKind>();
  let timer: NodeJS.Timeout | null = null;
  let scanQueue: Promise<void> = Promise.resolve();
  let pendingScans = 0;
  let readyPromise: Promise<void> | null = null;
  let resolveReady: (() => void) | null = null;
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
    // Watch before scanning so events during the async walk are not missed. Scans
    // run serially and re-check `closed` after every await, so none leak past close().
    pendingScans += 1;
    scanQueue = scanQueue
      .then(() => scanSubdirectories(directory))
      .catch(reportError)
      .finally(() => {
        pendingScans -= 1;
        if (pendingScans === 0) resolveReady?.();
      });
  };

  const scanSubdirectories = async (directory: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => comparePosixStrings(a.name, b.name));
    for (const entry of entries) {
      if (closed) return;
      if (!entry.isDirectory() || isExcludedDirectoryName(entry.name)) continue;
      const child = join(directory, entry.name);
      if (!isProjectPath(rootDirectory, child)) continue;
      watchDirectory(child);
    }
  };

  return {
    start: () => {
      if (readyPromise) return readyPromise;
      if (closed) return Promise.resolve();
      readyPromise = new Promise<void>((resolveReadyPromise) => {
        resolveReady = resolveReadyPromise;
      });
      watchDirectory(rootDirectory);
      if (pendingScans === 0) resolveReady?.();
      return readyPromise;
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
      // Waiting on the serial queue keeps close() deterministic.
      await scanQueue;
    },
  };
}

function mergeChangeKind(
  previous: ProjectFileChangeKind | undefined,
  next: ProjectFileChangeKind,
): ProjectFileChangeKind {
  if (!previous) return next;
  if (next === "remove") return "remove";
  if (next === "add") return previous === "remove" ? "add" : previous;
  if (previous === "remove") return "change";
  return "change";
}

function classifyChange(absolutePath: string, wasRenamed: boolean): ProjectFileChangeKind {
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
    return isWithin(rootDirectory, canonical)
      && !isSensitiveProjectPath(relative(rootDirectory, canonical).split(sep).join("/"))
      ? canonical
      : null;
  } catch {
    const parent = dirname(path);
    if (parent === path) return null;
    try {
      const canonicalParent = realpathSync(parent);
      return isWithin(rootDirectory, canonicalParent)
        && !isSensitiveProjectPath(relative(rootDirectory, canonicalParent).split(sep).join("/"))
        ? canonicalParent
        : null;
    } catch {
      return null;
    }
  }
}

function isExcludedDirectory(rootDirectory: string, path: string): boolean {
  return relative(rootDirectory, resolve(path)).split(sep).some((segment) =>
    isExcludedDirectoryName(segment));
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
