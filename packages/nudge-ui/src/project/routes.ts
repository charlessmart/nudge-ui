import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NUDGE_UI_ROUTES_PATH, type DiscoveredRoute, type RouteCatalog } from "../transport/routeCatalog.ts";

const IGNORED = new Set(["node_modules", ".git", ".nudge", "dist", "build", ".next"]);

async function filesBelow(directory: string, extensions: RegExp, ignored = IGNORED): Promise<string[]> {
  const files: string[] = [];
  async function visit(path: string, depth: number): Promise<void> {
    if (depth > 24 || files.length >= 512) return;
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || ignored.has(entry.name) || entry.name.startsWith(".")) continue;
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(child, depth + 1);
      else if (entry.isFile() && extensions.test(entry.name) && files.length < 512) files.push(child);
    }
  }
  await visit(directory, 0);
  return files;
}

async function frameworkDirectory(root: string, name: string): Promise<string> {
  const direct = resolve(root, name);
  return (await stat(direct).catch(() => null))?.isDirectory() ? direct : resolve(root, "src", name);
}

/** Reads only framework page conventions; it does not evaluate application code. */
export async function discoverRoutes(root: string, framework: RouteCatalog["framework"], pageExtensions = ["js", "jsx", "ts", "tsx"], htmlEntries: readonly string[] = []): Promise<RouteCatalog> {
  const routes: DiscoveredRoute[] = [];
  const add = (path: string, file: string): void => {
    if (!routes.some((route) => route.path === path)) routes.push({ path, source: relative(root, file).split("\\").join("/"), dynamic: path.includes("[") });
  };
  if (framework === "next") {
    for (const name of ["app", "pages"]) {
      const directory = await frameworkDirectory(root, name);
      const files = await filesBelow(directory, /\.[a-z0-9]+$/i);
      for (const file of files) {
        const local = relative(directory, file).split("\\").join("/");
        const extension = [...pageExtensions].sort((a, b) => b.length - a.length).find((extension) => local.endsWith(`.${extension}`));
        if (!extension) continue;
        const segments = local.slice(0, -(extension.length + 1)).split("/");
        if (name === "app") {
          if (segments.pop() !== "page" || segments.some((part) => part.startsWith("_") || part.startsWith("@") || /^\(\.{1,3}\)/.test(part))) continue;
          add("/" + segments.filter((part) => !/^\(.+\)$/.test(part)).join("/"), file);
        } else {
          if (segments[0] === "api" || segments.at(-1)?.startsWith("_")) continue;
          if (segments.at(-1) === "index") segments.pop();
          add("/" + segments.join("/"), file);
        }
      }
    }
  } else if (framework === "astro") {
    const directory = resolve(root, "src/pages");
    for (const file of await filesBelow(directory, /\.(astro|md|mdx|html)$/)) {
      let path = relative(directory, file).split("\\").join("/").replace(/\.(astro|md|mdx|html)$/, "");
      path = path.replace(/(^|\/)index$/, "");
      add("/" + path, file);
    }
  } else {
    const ignored = framework === "vite" ? new Set([...IGNORED, "public", "test", "tests", "__tests__", "fixtures", "examples", "coverage"]) : IGNORED;
    const discovered = await filesBelow(root, /\.html$/, ignored);
    const configured = htmlEntries.map((entry) => resolve(root, entry)).filter((file) => file.endsWith(".html") && !relative(root, file).startsWith(".."));
    for (const file of new Set([...discovered, ...configured])) {
      const local = relative(root, file).split("\\").join("/");
      // Vite serves HTML entry points; static hosts preserve non-index extensions.
      const path = local.replace(/(^|\/)index\.html$/, "$1");
      add("/" + path, file);
    }
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return { framework, routes, ...(framework === "vite" ? { message: "HTML entry pages are available. Routes defined inside a client router are not discovered yet." } : {}) };
}

export async function handleRouteCatalogRequest(request: IncomingMessage, response: ServerResponse, root: string, framework: RouteCatalog["framework"], pageExtensions?: string[], resolvedCatalog?: RouteCatalog, basePath = "", htmlEntries?: readonly string[]): Promise<boolean> {
  if (new URL(request.url ?? "/", "http://nudge-ui.local").pathname !== NUDGE_UI_ROUTES_PATH) return false;
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.statusCode = 405; response.setHeader("Allow", "GET"); response.end(); return true; }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const catalog = resolvedCatalog ?? await discoverRoutes(root, framework, pageExtensions, htmlEntries);
    response.end(JSON.stringify({ ...catalog, routes: catalog.routes.map((route) => ({ ...route, path: `${basePath}${route.path}` })) }));
  }
  catch { response.statusCode = 500; response.end(JSON.stringify({ error: "Route discovery failed." })); }
  return true;
}
