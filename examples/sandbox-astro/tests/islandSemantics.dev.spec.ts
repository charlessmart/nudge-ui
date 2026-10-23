import { expect, test } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";

function trackSevereErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /nudge-ui|\$RefreshSig|hydrat/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/nudge-ui|\$RefreshSig|hydrat/i.test(error.message)) errors.push(error.message);
  });
  return () => errors;
}

async function waitForInspector(page: Page): Promise<Frame> {
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").not.toBe("");
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Astro preview frame did not become ready");
  return frame;
}

/** Hydration must have attached React fibers before selection can resolve semantic targets. */
async function waitForHydratedIsland(frame: Frame): Promise<void> {
  await expect.poll(() =>
    frame.evaluate(() => {
      const badge = document.querySelector(".counter-label");
      return Boolean(
        badge instanceof HTMLElement
        && Object.keys(badge).some((key) => key.startsWith("__reactFiber$")),
      );
    }),
  ).toBe(true);
}

async function selectIslandBadge(page: Page): Promise<{ frame: Frame; severeErrors: () => string[] }> {
  const severeErrors = trackSevereErrors(page);
  await page.goto("/");
  const frame = await waitForInspector(page);
  await waitForHydratedIsland(frame);

  await frame.locator(".counter-label").click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  return { frame, severeErrors };
}

async function copyPrompt(page: Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  // The clipboard write lands asynchronously; the button flips data-copied when it does.
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute(
    "data-copied",
    "true",
  );
  return page.evaluate(() => navigator.clipboard.readText());
}

test("dev: selecting inside the hydrated island exposes component-semantics controls", async ({ page }) => {
  const { severeErrors } = await selectIslandBadge(page);

  const section = page.locator('[data-test="component-props-section"]');
  await expect(section).toBeVisible();
  await expect(section).toHaveAttribute("data-component", "IslandCounter");
  await expect(page.locator('[data-test="component-prop-variant"]')).toBeVisible();
  await expect(
    page.locator('[data-test="component-prop-boolean"][data-property="disabled"]'),
  ).toBeVisible();

  expect(severeErrors()).toEqual([]);
});

test("dev: page-level .astro elements expose no component-semantics controls", async ({ page }) => {
  const severeErrors = trackSevereErrors(page);
  await page.goto("/");
  const frame = await waitForInspector(page);
  await waitForHydratedIsland(frame);

  // .site-title is rendered by Header.astro: no runtime to rerender, so no semantic controls.
  await frame.locator(".site-header .site-title").click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="component-props-section"]')).toHaveCount(0);

  expect(severeErrors()).toEqual([]);
});

test("dev: flipping typed props rerenders the real island component without managed stylesheet declarations", async ({ page }) => {
  const { frame, severeErrors } = await selectIslandBadge(page);

  const badge = frame.locator(".counter-label").first();
  await expect(badge).toHaveClass(/counter-label--primary/);
  await expect(badge).toHaveAttribute("data-rendered-variant", "primary");

  await page.locator('[data-test="component-prop-variant"]').click();
  await page.locator('.select__item[data-value="ghost"]').click();
  await expect(badge).toHaveClass(/counter-label--ghost/);
  await expect(badge).toHaveAttribute("data-rendered-variant", "ghost");

  await page.locator(
    '[data-test="component-prop-boolean"][data-property="disabled"] button[aria-label="On"]',
  ).click();
  await expect(frame.locator(".counter-label").first()).toHaveText("Island (off)");
  await expect(frame.locator(".counter-button")).toBeDisabled();

  // A semantic override must contribute zero CSS rules, so the class/text assertions can only pass from a real rerender.
  await expect.poll(async () => {
    return frame.evaluate(() => {
      const sheet = document.getElementById("nudge-ui-styles") as HTMLStyleElement | null;
      // The sheet may be created lazily by unrelated preview machinery; what matters is that an override contributes no rules.
      return sheet?.sheet ? sheet.sheet.cssRules.length : 0;
    });
  }).toBe(0);

  expect(severeErrors()).toEqual([]);
});

test("dev: the generated prompt carries the island component record without identity leakage", async ({ page }) => {
  const { frame, severeErrors } = await selectIslandBadge(page);

  await page.locator('[data-test="component-prop-variant"]').click();
  await page.locator('.select__item[data-value="ghost"]').click();
  await expect(frame.locator(".counter-label").first()).toHaveClass(/counter-label--ghost/);

  const prompt = await copyPrompt(page);
  expect(prompt).toContain("## Component prop changes");
  expect(prompt).toContain("### IslandCounter invocation (src/components/Counter.tsx:");
  expect(prompt).toContain("`variant`: `primary` → `ghost`");
  expect(prompt).toContain("Component contract: `src/components/Counter#IslandCounter`");
  // Injected runtime selectors are not source guidance.
  expect(prompt).not.toContain("data-cid");
  expect(prompt).not.toContain("data-cprops");

  expect(severeErrors()).toEqual([]);
});

test("dev: the astro-island host keeps Astro-derived identity across hydration", async ({ page }) => {
  const severeErrors = trackSevereErrors(page);

  // Installed before any page script runs, so nothing can slip past it; attribute-only mutations (Astro's toolbar stripping its own annotations) are ignored.
  await page.addInitScript(() => {
    const removedTracked: string[] = [];
    (window as unknown as { __dtRemovedTracked?: string[] }).__dtRemovedTracked = removedTracked;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) {
          if (!(node instanceof Element)) continue;
          for (const element of [node, ...node.querySelectorAll("[data-cid]")]) {
            const cid = element.getAttribute("data-cid");
            if (cid !== null) removedTracked.push(`${element.tagName.toLowerCase()}#${cid}`);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto("/");
  const frame = await waitForInspector(page);
  await waitForHydratedIsland(frame);

  // The shared plugin transforms island JSX for SSR too, so the server HTML already carries these cids.
  const rawHtml = await (await page.request.get("/")).text();
  expect(rawHtml).toContain('data-cid="IslandCounter"');
  expect(rawHtml).toMatch(/<astro-island[^>]*data-cid="astro:Island"/);

  const islandHost = frame.locator("astro-island");
  await expect(islandHost).toHaveAttribute("data-cid", "astro:Island");
  // Astro does not annotate its hydration host, so it degrades to a generated label; if that ever changes, only exact coordinates are acceptable.
  const hostSrc = await islandHost.getAttribute("data-src");
  if (hostSrc !== null) expect(hostSrc).toMatch(/\.astro:\d+:\d+$/);
  await expect(frame.locator(".counter-label")).toHaveAttribute("data-cid", "IslandCounter");
  await expect(frame.locator(".counter-label")).toHaveAttribute(
    "data-src",
    /src\/components\/Counter\.tsx:\d+:\d+/,
  );

  const removedTracked = await frame.evaluate(
    () => (window as unknown as { __dtRemovedTracked?: string[] }).__dtRemovedTracked ?? [],
  );
  expect(removedTracked).toEqual([]);

  expect(severeErrors()).toEqual([]);
});

test("dev: a slow react-refresh runtime does not break the page", async ({ page }) => {
  const severeErrors = trackSevereErrors(page);

  // Traps every `$RefreshReg$` read; the invariant is checked in-page because CDP serialization erases functions.
  await page.addInitScript(() => {
    const reads: unknown[] = [];
    let value: unknown;
    Object.defineProperty(window, "$RefreshReg$", {
      configurable: true,
      get() {
        reads.push(value);
        return value;
      },
      set(next: unknown) {
        value = next;
      },
    });
    (window as unknown as { __dtRefreshRegReads?: unknown[] }).__dtRefreshRegReads = reads;
  });

  // Transformed module graphs statically import the refresh runtime, so delaying it delays everything.
  await page.route("**/@react-refresh", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/");
  const frame = await waitForInspector(page);
  await waitForHydratedIsland(frame);

  const summary = await frame.evaluate(() => {
    const reads = (window as unknown as { __dtRefreshRegReads?: unknown[] }).__dtRefreshRegReads
      ?? [];
    return {
      count: reads.length,
      allReadsFunctions: reads.every((read) => typeof read === "function"),
    };
  });
  expect(summary.count).toBeGreaterThan(0);
  expect(summary.allReadsFunctions).toBe(true);

  expect(severeErrors()).toEqual([]);
});
