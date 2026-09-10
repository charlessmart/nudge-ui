import { expect, test } from "@playwright/test";
import type { ComponentRuntimeAdapter } from "@nudge-ui/inspector/host-runtime";

test("dev: prebuilt client and host React Adapter meet at the runtime seam", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() =>
    Boolean(document.getElementById("nudge-ui-root")?.shadowRoot))).toBe(true);

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/__nudge_ui__/manifest");
    return response.json() as Promise<{
      version: number;
      runtime: { host: string; framework: string };
    }>;
  });
  expect(manifest).toMatchObject({
    version: 1,
    runtime: { host: "astro", framework: "Astro" },
  });

  const target = await page.evaluate(() => {
    const registry = (globalThis as unknown as Record<PropertyKey, {
      adapters: Map<string, ComponentRuntimeAdapter>;
    }>)[Symbol.for("nudge-ui.host-runtime.v1")];
    const adapter = registry?.adapters.get("react");
    const element = document.querySelector<HTMLElement>(".counter-label");
    if (!adapter || !element) return null;
    return adapter.inspect(element)[0] ?? null;
  });
  expect(target).toMatchObject({
    framework: "react",
    meta: { componentName: "IslandCounter" },
    props: { label: "Island", variant: "primary", disabled: false },
  });

  if (!target) throw new Error("The React Adapter did not return a target.");
  await page.evaluate((callsiteId) => {
    const registry = (globalThis as unknown as Record<PropertyKey, {
      adapters: Map<string, ComponentRuntimeAdapter>;
    }>)[Symbol.for("nudge-ui.host-runtime.v1")];
    const adapter = registry?.adapters.get("react");
    if (!adapter) throw new Error("The React Adapter is not registered.");
    adapter.replaceOverrides([{
      framework: "react",
      callsiteId,
      prop: "variant",
      value: "ghost",
    }]);
  }, target.meta.callsiteId);
  await expect(page.locator(".counter-label")).toHaveAttribute(
    "data-rendered-variant",
    "ghost",
  );
});
