import { expect, it } from "vitest";
import { astroRouteCatalog, type AstroPageRoute } from "./routes.ts";

it("lists resolved user and integration pages while excluding Astro internals", () => {
  const page = (pattern: string, origin: AstroPageRoute["origin"] = "project"): AstroPageRoute => ({
    pattern, origin, type: "page", entrypoint: "pages/index.astro", params: [],
  });
  const catalog = astroRouteCatalog([
    page("/"), page("/docs", "external"), page("/404", "internal"), page("/_server-islands/[name]", "internal"),
    { ...page("/blog/[slug]"), params: ["slug"] }, { ...page("/feed.xml"), type: "endpoint" },
  ], "/app/");
  expect(catalog.routes.map(({ path, dynamic }) => ({ path, dynamic }))).toEqual([
    { path: "/app/", dynamic: false }, { path: "/app/blog/[slug]", dynamic: true }, { path: "/app/docs", dynamic: false },
  ]);
});
