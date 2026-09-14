import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isReservedNudgeUiRoute, NUDGE_UI_ROUTE_PREFIX } from "./index.ts";

const transportDir = fileURLToPath(new URL(".", import.meta.url));

describe("reserved routes", () => {
  it("claims the namespace root and everything below it", () => {
    expect(isReservedNudgeUiRoute("/__nudge_ui__")).toBe(true);
    expect(isReservedNudgeUiRoute(NUDGE_UI_ROUTE_PREFIX)).toBe(true);
    expect(isReservedNudgeUiRoute("/__nudge_ui__/manifest")).toBe(true);
  });

  it("leaves project paths alone, including lookalikes", () => {
    expect(isReservedNudgeUiRoute("/index.html")).toBe(false);
    expect(isReservedNudgeUiRoute("/__nudge_ui__extra")).toBe(false);
    expect(isReservedNudgeUiRoute("/app/__nudge_ui__/manifest")).toBe(false);
  });
});

// The inspector's mount components import these routes, so a Node import here
// would break browser hosts at bundle time rather than in this package.
it("stays browser-safe", () => {
  const offenders = readdirSync(transportDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => /from\s+["']node:/.test(readFileSync(join(transportDir, name), "utf8")));
  expect(offenders).toEqual([]);
});
