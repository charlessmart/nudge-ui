import { posix } from "node:path";

export function stripModuleExtension(value: string): string {
  return value.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, "");
}

/**
 * The one component identity format: extensionless module source, a `#` marker,
 * then the export name. Identity and policy both match on this exact string.
 */
export function componentIdentity(moduleSource: string, exportName: string): string {
  return `${stripModuleExtension(moduleSource)}#${exportName}`;
}

/** Project-relative identity path; files outside the root keep a `../` prefix so ids stay unique and machine paths never reach the DOM or a prompt. */
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
