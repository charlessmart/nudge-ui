import { expect, test } from "@playwright/test";

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

  const target = await page.evaluate((): {
    framework: string;
    meta: { callsiteId: string; componentName: string };
    props: Record<string, unknown>;
  } | null => {
    const registry = (globalThis as unknown as Record<PropertyKey, {
      adapters: Map<string, {
        inspect(element: Element): unknown[];
        replaceOverrides(overrides: unknown[]): void;
      }>;
    }>)[Symbol.for("nudge-ui.host-runtime.v1")];
    const element = document.querySelector(".counter-label");
    if (!registry || !element) return null;
    return registry.adapters.get("react")?.inspect(element)[0] ?? null;
  });
  expect(target).toMatchObject({
    framework: "react",
    meta: { componentName: "IslandCounter" },
    props: { label: "Island", variant: "primary", disabled: false },
  });

  if (!target) throw new Error("The React Adapter did not return a target.");
  await page.evaluate((callsiteId) => {
    const registry = (globalThis as unknown as Record<PropertyKey, {
      adapters: Map<string, { replaceOverrides(overrides: unknown[]): void }>;
    }>)[Symbol.for("nudge-ui.host-runtime.v1")];
    registry.adapters.get("react")?.replaceOverrides([{
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
