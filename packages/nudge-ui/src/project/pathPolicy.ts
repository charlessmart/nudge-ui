/**
 * Dot-prefixed segments commonly hold credentials, source-control metadata, or
 * local tool state. Treating the whole segment as sensitive keeps one policy
 * across direct requests, symlink targets, token discovery, and file watching.
 */
export function isSensitiveProjectPath(projectPath: string): boolean {
  return projectPath.split(/[\\/]/).some((segment) => segment.startsWith("."));
}

/** Returns whether a directory name is outside the standalone project view. */
export function isExcludedDirectoryName(name: string): boolean {
  return name.startsWith(".") || name === "build" || name === "dist" || name === "node_modules";
}
