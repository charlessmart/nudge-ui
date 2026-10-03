/** Framework-discovered page definitions. Dynamic patterns need concrete URLs. */
export interface DiscoveredRoute {
  path: string;
  source: string;
  dynamic: boolean;
}
export interface RouteCatalog {
  framework: "next" | "astro" | "html" | "vite";
  routes: DiscoveredRoute[];
  message?: string;
}
export { NUDGE_UI_ROUTES_PATH } from "./routes.ts";

export function isRouteCatalog(value: unknown): value is RouteCatalog {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Record<string, unknown>;
  return ["next", "astro", "html", "vite"].includes(String(catalog.framework))
    && (catalog.message === undefined || typeof catalog.message === "string")
    && Array.isArray(catalog.routes) && catalog.routes.length <= 512
    && catalog.routes.every((route: unknown) => {
      if (!route || typeof route !== "object") return false;
      const page = route as Record<string, unknown>;
      return typeof page.path === "string" && page.path.startsWith("/") && !page.path.startsWith("//")
        && !/[\\\\?#\u0000-\u001f]/.test(page.path) && page.path.length <= 2048
        && typeof page.source === "string" && page.source.length <= 4096 && typeof page.dynamic === "boolean";
    });
}
