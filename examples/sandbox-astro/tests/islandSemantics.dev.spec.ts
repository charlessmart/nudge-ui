import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Stage 5 conformance — React island support (docs/features/
 * astro-host-adapter.md, ADR-0011, ADR-0007).
 *
 * Semantic component-prop projection stays inside hydrated island boundaries:
 * the shared Vite plugin instruments island JSX, the Astro response layer
 * keeps identity only on page-level elements and the astro-island host, and
 * a prop override must rerender the REAL component without producing a
 * managed stylesheet declaration.
 */

/** Collects console/page errors attributable to Design Tool or hydration. */
function trackSevereErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /design-tool|\$RefreshSig|hydrat/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/design-tool|\$RefreshSig|hydrat/i.test(error.message)) errors.push(error.message);
  });
  return () => errors;
}

async function waitForInspector(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __designTool?: unknown }).__designTool)))
    .toBe(true);
}

/** Hydration must have attached React fibers before selection can resolve semantic targets. */
async function waitForHydratedIsland(page: Page): Promise<void> {
  await expect.poll(() =>
    page.evaluate(() => {
      const badge = document.querySelector(".counter-label");
      return Boolean(
        badge instanceof HTMLElement
        && Object.keys(badge).some((key) => key.startsWith("__reactFiber$")),
      );
    }),
  ).toBe(true);
}

async function selectIslandBadge(page: Page): Promise<() => string[]> {
  const severeErrors = trackSevereErrors(page);
  await page.goto("/");
  await waitForInspector(page);
  await waitForHydratedIsland(page);

  await page.locator(".counter-label").click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "IslandCounter",
  );
  return severeErrors;
}

async function copyPrompt(page: Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  // The clipboard write resolves asynchronously after the click; the button
  // flips data-copied when it lands.
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute(
    "data-copied",
    "true",
  );
  return page.evaluate(() => navigator.clipboard.readText());
}

test("dev: selecting inside the hydrated island exposes component-semantics controls", async ({ page }) => {
  const severeErrors = await selectIslandBadge(page);

  // The island internals carry React-transform identity; the panel names the
  // island component and lists every typed prop with a current value.
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
  await waitForInspector(page);
  await waitForHydratedIsland(page);

  // The site title is rendered by Header.astro: response-layer identity, no
  // runtime to rerender, therefore no semantic controls.
  await page.locator(".site-header .site-title").click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    /astro:/,
  );
  await expect(page.locator('[data-test="component-props-section"]')).toHaveCount(0);

  expect(severeErrors()).toEqual([]);
});

test("dev: flipping typed props rerenders the real island component without managed stylesheet declarations", async ({ page }) => {
  const severeErrors = await selectIslandBadge(page);

  const badge = page.locator(".counter-label").first();
  await expect(badge).toHaveClass(/counter-label--primary/);
  await expect(badge).toHaveAttribute("data-rendered-variant", "primary");

  // Enum override → the real component's output changes.
  await page.locator('[data-test="component-prop-variant"]').click();
  await page.locator('.dt-select__item[data-value="ghost"]').click();
  await expect(badge).toHaveClass(/counter-label--ghost/);
  await expect(badge).toHaveAttribute("data-rendered-variant", "ghost");

  // Boolean override → same real-rerender proof through rendered text.
  await page.locator(
    '[data-test="component-prop-boolean"][data-property="disabled"] button[aria-label="On"]',
  ).click();
  await expect(page.locator(".counter-label").first()).toHaveText("Island (off)");
  await expect(page.locator(".counter-button")).toBeDisabled();

  // ADR-0007 holds inside islands: any managed stylesheet that exists carries
  // ZERO rules after either override — semantic changes never project into
  // CSS rules, and no host inline style or application-owned attribute was
  // mutated (the class/text assertions above are only coherent from a real
  // rerender).
  await expect.poll(async () => {
    return page.evaluate(() => {
      const sheet = document.getElementById("design-tool-styles") as HTMLStyleElement | null;
      // The sheet may be created lazily by unrelated preview machinery; what
      // matters is that a semantic override contributes no rules to it.
      return sheet?.sheet ? sheet.sheet.cssRules.length : 0;
    });
  }).toBe(0);

  expect(severeErrors()).toEqual([]);
});

test("dev: the generated prompt carries the island component record without identity leakage", async ({ page }) => {
  const severeErrors = await selectIslandBadge(page);

  await page.locator('[data-test="component-prop-variant"]').click();
  await page.locator('.dt-select__item[data-value="ghost"]').click();
  await expect(page.locator(".counter-label").first()).toHaveClass(/counter-label--ghost/);

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

  // Record whether hydration replaces any tracked server DOM node. The
  // observer is installed before any page script runs, so nothing can slip
  // past it; attribute-only mutations (Astro's toolbar stripping its own
  // annotations) are ignored because they do not remove nodes.
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
  await waitForInspector(page);
  await waitForHydratedIsland(page);

  // Identity handoff: the server HTML already carried React-transform cids
  // inside the island (the shared plugin transforms island JSX for SSR too),
  // and the live DOM retains them after hydration.
  const rawHtml = await (await page.request.get("/")).text();
  expect(rawHtml).toContain('data-cid="IslandCounter"');
  expect(rawHtml).toMatch(/<astro-island[^>]*data-cid="astro:Island"/);

  const islandHost = page.locator("astro-island");
  await expect(islandHost).toHaveAttribute("data-cid", "astro:Island");
  // Astro does not annotate its compiler-generated hydration host with source
  // annotations, so the host degrades to the generated label without an
  // invented location (ADR-0011 degraded mode). If Astro ever annotates it,
  // only exact authored coordinates are acceptable.
  const hostSrc = await islandHost.getAttribute("data-src");
  if (hostSrc !== null) expect(hostSrc).toMatch(/\.astro:\d+:\d+$/);
  await expect(page.locator(".counter-label")).toHaveAttribute("data-cid", "IslandCounter");
  await expect(page.locator(".counter-label")).toHaveAttribute(
    "data-src",
    /src\/components\/Counter\.tsx:\d+:\d+/,
  );

  const removedTracked = await page.evaluate(
    () => (window as unknown as { __dtRemovedTracked?: string[] }).__dtRemovedTracked ?? [],
  );
  expect(removedTracked).toEqual([]);

  expect(severeErrors()).toEqual([]);
});

test("dev: a slow react-refresh runtime does not break the page", async ({ page }) => {
  const severeErrors = trackSevereErrors(page);

  // Trap every `$RefreshReg$` read so the assertion can observe what
  // plugin-react's transformed modules actually saw. The invariant is
  // evaluated inside the page: CDP serialization erases functions, so
  // `typeof` in Node would always read "object".
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

  // Delay the refresh runtime's module response. Transformed module graphs
  // (islands and the inspector) statically import it, so everything waits
  // for it — the page must still come up intact, with no module ever
  // evaluating against a missing `$RefreshReg$` baseline.
  await page.route("**/@react-refresh", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/");
  await waitForInspector(page);
  await waitForHydratedIsland(page);

  const summary = await page.evaluate(() => {
    const reads = (window as unknown as { __dtRefreshRegReads?: unknown[] }).__dtRefreshRegReads
      ?? [];
    return {
      count: reads.length,
      allReadsFunctions: reads.every((read) => typeof read === "function"),
    };
  });
  // Transformed modules (island and inspector graphs) did read the global…
  expect(summary.count).toBeGreaterThan(0);
  // …and every read observed a baseline or the real runtime, never
  // `undefined`.
  expect(summary.allReadsFunctions).toBe(true);

  expect(severeErrors()).toEqual([]);
});
