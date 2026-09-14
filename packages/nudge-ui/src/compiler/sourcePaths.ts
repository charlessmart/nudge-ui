import { posix } from "node:path";

/** Strip a TypeScript or JavaScript module extension from a resolved path. */
export function stripModuleExtension(value: string): string {
  return value.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
}

/**
 * Project-relative source path used by `data-src`, callsite identity, and
 * catalog keys.
 *
 * A file outside the project root (an authored workspace package) keeps a
 * `../`-prefixed relative path, so identity stays unique across packages and
 * machine paths never reach the DOM or a prompt. Every host Adapter reads this
 * function so their identity strings cannot drift.
 */
export function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : `${root}/`;
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
    if (id.startsWith("/") && root.startsWith("/")) {
      const relativeId = posix.relative(root, id);
      if (relativeId && relativeId !== ".") return relativeId;
    }
  }
  return id.replace(/^\//, "");
}
