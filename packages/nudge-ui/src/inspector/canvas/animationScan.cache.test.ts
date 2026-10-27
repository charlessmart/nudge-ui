// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateStyleResolutionCache } from "../tokens/resolution/cssomCollector.ts";
import { invalidatePageScan, scanPageAnimations, trackPageScanChanges } from "./animationScan.ts";

function countQueries(run: () => void): number {
  const spy = vi.spyOn(document, "querySelectorAll");
  run();
  const calls = spy.mock.calls.length;
  spy.mockRestore();
  return calls;
}

describe("shared page scans", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  function mountPage(): void {
    document.head.innerHTML = "<style>.card { transition: opacity 1s; } .card:hover { opacity: 0.5; }</style>";
    document.body.innerHTML = '<div class="card">Card</div>';
  }

  it("scans fresh every time while nothing reports page changes", () => {
    mountPage();
    scanPageAnimations(document);
    expect(countQueries(() => scanPageAnimations(document))).toBeGreaterThan(0);
  });

  it("reuses one scan while a tracker reports changes, until the page changes", () => {
    mountPage();
    const release = trackPageScanChanges();
    scanPageAnimations(document);

    expect(countQueries(() => scanPageAnimations(document))).toBe(0);

    invalidatePageScan();
    expect(countQueries(() => scanPageAnimations(document))).toBeGreaterThan(0);
    release();
  });

  it("scans again when a page stylesheet changes", () => {
    mountPage();
    const release = trackPageScanChanges();
    scanPageAnimations(document);

    invalidateStyleResolutionCache(document);

    expect(countQueries(() => scanPageAnimations(document))).toBeGreaterThan(0);
    release();
  });

  it("applies each caller's skip to the shared result", () => {
    mountPage();
    const release = trackPageScanChanges();
    const all = scanPageAnimations(document);
    const skipped = scanPageAnimations(document, () => true);

    expect(skipped).toHaveLength(0);
    expect(all.length).toBeGreaterThanOrEqual(skipped.length);
    release();
  });
});
