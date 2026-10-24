/** Shared by the Turbopack rule condition and the loader's runtime scope check so the two cannot drift apart. */
export const NUDGE_UI_PACKAGE_DIRECTORIES = [
  "agent-protocol",
  "chrome-extension",
  "compatibility",
  "create-nudge-ui",
  "mcp",
  "nudge-ui",
  "package-css-fixture",
] as const;

const ALTERNATION = NUDGE_UI_PACKAGE_DIRECTORIES.join("|");

/** Turbopack `condition.path` matcher; not interchangeable with a JavaScript RegExp literal. */
export const nudgeUiRepositoryPackagePath =
  `[\\/]packages[\\/](${ALTERNATION})[\\/]`;

export const nudgeUiRepositoryPackagePattern = new RegExp(
  `[\\\\/]packages[\\\\/](?:${ALTERNATION})[\\\\/]`,
);
