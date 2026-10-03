import type { RouteCatalog } from "../../transport/routeCatalog.ts";

/** The resolved page fields consumed from Astro's integration hook. */
export interface AstroPageRoute {
  type: string;
  origin: "internal" | "external" | "project";
  pathname?: string;
  pattern: string;
  entrypoint: string;
  params: readonly string[];
}

export function astroRouteCatalog(routes: readonly AstroPageRoute[], basePath: string): RouteCatalog {
  const pages = new Map<string, RouteCatalog["routes"][number]>();
  for (const route of routes) {
    if (route.type !== "page" || route.origin === "internal") continue;
    const path = `${basePath.replace(/\/$/, "")}${route.pathname ?? route.pattern}`;
    pages.set(path, { path, source: route.entrypoint, dynamic: route.params.length > 0 });
  }
  return { framework: "astro", routes: [...pages.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 512) };
}
