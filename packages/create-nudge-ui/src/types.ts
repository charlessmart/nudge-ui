export const frameworks = ["nextjs", "astro", "vite-react", "standalone"] as const;
export type Framework = typeof frameworks[number];

export const packageManagers = ["pnpm", "npm", "yarn", "bun"] as const;
export type PackageManager = typeof packageManagers[number];

export interface ProjectManifest {
  readonly type?: string;
  readonly packageManager?: string;
  readonly dependencies: ReadonlySet<string>;
}

export interface ConfigurationChange {
  readonly path: string;
  readonly content: string;
  readonly created: boolean;
  readonly originalContent?: string;
}
