/** Dot-prefixed segments may hold credentials or local tool state; one policy covers requests, symlinks, tokens, and watching. */
export function isSensitiveProjectPath(projectPath: string): boolean {
  return projectPath.split(/[\\/]/).some((segment) => segment.startsWith("."));
}

export function isExcludedDirectoryName(name: string): boolean {
  return name.startsWith(".") || name === "build" || name === "dist" || name === "node_modules";
}
