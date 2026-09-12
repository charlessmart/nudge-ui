/**
 * Nudge UI's own workspace packages, by directory name.
 *
 * In this repository those packages are symlinked into a consumer, so they are
 * source-backed rather than "foreign" to Turbopack and must be excluded by path
 * (see ADR-0010). A registry install never contains these paths, and an
 * explicitly declared `sourceRoots` entry always wins over this list.
 *
 * The Turbopack rule condition and the loader's runtime scope check share this
 * module so the two can never drift apart.
 */
export const NUDGE_UI_PACKAGE_DIRECTORIES = [
  "agent-protocol",
  "compiler",
  "compatibility",
  "create-nudge-ui",
  "css",
  "inspector",
  "mcp",
  "nextjs",
  "package-css-fixture",
  "plugin",
  "standalone",
] as const;

const ALTERNATION = NUDGE_UI_PACKAGE_DIRECTORIES.join("|");

/**
 * Turbopack `condition.path` matcher source. Deliberately identical to the
 * pattern that shipped before this module existed; the Next-facing format is
 * not interchangeable with a JavaScript RegExp literal.
 */
export const nudgeUiRepositoryPackagePath =
  `[\\/]packages[\\/](${ALTERNATION})[\\/]`;

/** Loader-time matcher for the same repository packages, on either separator. */
export const nudgeUiRepositoryPackagePattern = new RegExp(
  `[\\\\/]packages[\\\\/](?:${ALTERNATION})[\\\\/]`,
);
