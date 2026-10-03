import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverRoutes } from "./routes.ts";
import { isRouteCatalog } from "../transport/routeCatalog.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nudge-route-discovery-")); roots.push(root);
  for (const file of files) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), ""); }
  return root;
}
describe("framework route discovery", () => {
  it("finds Next public pages across both routers and excludes implementation routes", async () => {
    const root = await fixture(["app/page.tsx", "app/(shop)/cart/page.tsx", "app/products/[id]/page.tsx", "app/@modal/cart/page.tsx", "app/(.)cart/page.tsx", "app/_internal/page.tsx", "app/layout.tsx", "app/api/route.ts", "pages/about.tsx", "pages/blog/index.tsx", "pages/_app.tsx", "pages/api/users.ts"]);
    expect((await discoverRoutes(root, "next")).routes.map(({ path, dynamic }) => ({ path, dynamic }))).toEqual([
      { path: "/", dynamic: false }, { path: "/about", dynamic: false }, { path: "/blog", dynamic: false }, { path: "/cart", dynamic: false }, { path: "/products/[id]", dynamic: true },
    ]);
  });
  it("respects configured Next page extensions and src directory precedence", async () => {
    const root = await fixture(["src/app/page.tsx", "src/app/docs/page.mdx", "src/pages/help.page.tsx", "src/pages/ignored.tsx"]);
    expect((await discoverRoutes(root, "next", ["mdx", "page.tsx"])).routes.map((route) => route.path)).toEqual(["/docs", "/help"]);
  });
  it("lists Astro page patterns without inventing parameters or exposing endpoints", async () => {
    const root = await fixture(["src/pages/index.astro", "src/pages/about.md", "src/pages/blog/[...slug].astro", "src/pages/feed.xml.ts"]);
    expect((await discoverRoutes(root, "astro")).routes.map((route) => route.path)).toEqual(["/", "/about", "/blog/[...slug]"]);
  });
  it("finds HTML entry pages without traversing dependency folders or symlinks", async () => {
    const root = await fixture(["index.html", "docs/index.html", "about.html", "node_modules/dependency/page.html", ".nudge/artifacts/test/document.html"]);
    const external = await fixture(["outside.html"]); await symlink(external, join(root, "linked"));
    expect((await discoverRoutes(root, "html")).routes.map((route) => route.path)).toEqual(["/", "/about.html", "/docs/"]);
  });
  it("discovers Vite entry pages and explicit inputs without including fixtures or public assets", async () => {
    const root = await fixture(["index.html", "admin/index.html", "fixtures/design.html", "tests/example.html", "public/raw.html"]);
    const catalog = await discoverRoutes(root, "vite", undefined, ["fixtures/design.html"]);
    expect(catalog.routes.map((route) => route.path)).toEqual(["/", "/admin/", "/fixtures/design.html"]);
  });
  it("rejects unsafe catalog URLs", () => {
    for (const path of ["//other.test/", "/\\other.test/", "/test?query", "/test#fragment"]) expect(isRouteCatalog({ framework: "next", routes: [{ path, dynamic: false, source: "page.tsx" }] })).toBe(false);
  });
});
