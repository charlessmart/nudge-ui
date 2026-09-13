// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  ElementChangeRecord,
  PreviewableChangeRecord,
  TokenChangeRecord,
} from "../changes/changesLog.ts";
import { startStaleDetection, cancelStaleDetection, isVerificationPending } from "./staleChangeDetector.ts";
import {
  clearWorkspace,
  getChangesList,
  isElementChange,
  isPreviewableChange,
  restoreChangeRecords,
} from "../changes/changesLog.ts";
import { getRegisteredFrames } from "./projection.ts";
import { addCanvasCard, removeCanvasCard as removeCanvasCardStore, getCanvasCards } from "./canvasStore.ts";
import type { TokenEntry } from "virtual:design-tokens";
import { makeComponentChange } from "../changes/_testUtils.ts";
import { changeKey } from "../changes/model.ts";
import {
  beginPreviewAttempt,
  getHostPreviewDocument,
  getPreviewDiagnostic,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
} from "../changes/previewDiagnostics.ts";
import { getWorkspaceChanges } from "../changes/workspaceChanges.ts";

const TOKEN_A: TokenEntry = { name: "--color-a", value: "#aaaaaa", source: "styles.css:1" };
const TOKEN_B: TokenEntry = { name: "--color-b", value: "#bbbbbb", source: "styles.css:2" };

function makeElementChange(overrides: Partial<ElementChangeRecord> = {}): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"][data-src*="src/Button.tsx:1"]',
    property: "background",
    oldToken: TOKEN_A,
    newToken: TOKEN_B,
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
    ...overrides,
  };
}

function makeTokenChange(overrides: Partial<TokenChangeRecord> = {}): TokenChangeRecord {
  return {
    kind: "token",
    tokenName: "--color-surface-raised",
    file: "src/theme.css",
    line: 6,
    selector: ':root[data-theme="dark"]',
    property: "--color-surface-raised",
    rawValue: "#abcdef",
    oldRawValue: "#00ff00",
    context: {},
    contextLabel: 'root[data-theme="dark"]',
    source: { file: "src/theme.css", line: 6, component: "Global token" },
    ...overrides,
  };
}

function getPreviewableChanges(): PreviewableChangeRecord[] {
  return getChangesList().filter(isPreviewableChange);
}

function setupMockElements(...selectors: string[]): void {
  for (const sel of selectors) {
    const el = document.createElement("div");
    const attrs = sel.match(/\[([^\]]+)\]/g);
    if (attrs) {
      for (const attr of attrs) {
        const attrMatch = attr.match(/^\[([a-zA-Z][a-zA-Z0-9-]*)(?:[*^$~|]?=)"([^"]*)"\]$/);
        if (attrMatch) {
          el.setAttribute(attrMatch[1]!, attrMatch[2]!);
        }
      }
    }
    document.body.appendChild(el);
  }
}

function createMockFrame(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-nudge-ui-canvas-renderer", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write("<!DOCTYPE html><html><head></head><body></body></html>");
  doc.close();

  return iframe;
}

function addElementToFrame(iframe: HTMLIFrameElement, selector: string): void {
  const doc = iframe.contentDocument!;
  const el = doc.createElement("div");
  const attrs = selector.match(/\[([^\]]+)\]/g);
  if (attrs) {
    for (const attr of attrs) {
      const attrMatch = attr.match(/^\[([a-zA-Z][a-zA-Z0-9-]*)(?:[*^$~|]?=)"([^"]*)"\]$/);
      if (attrMatch) {
        el.setAttribute(attrMatch[1]!, attrMatch[2]!);
      }
    }
  }
  doc.body.appendChild(el);
}

describe("staleChangeDetector", () => {
  beforeEach(() => {
    cancelStaleDetection();
    clearWorkspace();
    resetPreviewDiagnostics();
  });

  afterEach(() => {
    cancelStaleDetection();
    clearWorkspace();
    resetPreviewDiagnostics();
  });

  describe("element change verification", () => {
    it("marks restored element changes as unverified on start", () => {
      const change = makeElementChange();
      restoreChangeRecords([change]);

      const changes = getPreviewableChanges();
      const attempt = beginPreviewAttempt(getHostPreviewDocument(), getWorkspaceChanges().revision)!;
      publishPreviewDiagnostic(attempt, changeKey(change), {
        status: "applied",
        requestedValue: "var(--color-b)",
        computedValue: "#bbbbbb",
      });
      expect(getPreviewDiagnostic(changeKey(change))?.result.status).toBe("applied");

      startStaleDetection(changes);
      expect(getPreviewDiagnostic(changeKey(change))).toBeUndefined();
    });

    it("marks an unmatched edit as stale after timeout", async () => {
      vi.useFakeTimers();
      const change = makeElementChange({
        selector: '[data-cid="Missing"][data-src*="Missing.tsx:1"]',
      });
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      const diagnostic = getPreviewDiagnostic(changeKey(updated[0]!));
      expect(diagnostic?.result.status).toBe("conflict");
      expect(diagnostic?.result.reason).toBe("target-missing");

      vi.useRealTimers();
    });

    it("does NOT mark a matched edit in the editable page as stale", async () => {
      vi.useFakeTimers();
      setupMockElements('[data-cid="Button"][data-src*="src/Button.tsx:1"]');

      const change = makeElementChange();
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getPreviewDiagnostic(changeKey(updated[0]!))).toBeUndefined();

      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    it("matches when element exists in a canvas frame but not the editable page", async () => {
      vi.useFakeTimers();
      const iframe = createMockFrame();
      const selector = '[data-cid="Sidebar"][data-src*="Sidebar.tsx:42"]';
      addElementToFrame(iframe, selector);

      const frameMap = getRegisteredFrames() as Map<string, HTMLIFrameElement>;

      const card = addCanvasCard("http://localhost:5173/about");
      frameMap.set(card.id, iframe);

      const change = makeElementChange({ selector, cid: "Sidebar", file: "src/Sidebar.tsx", line: 42 });
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getPreviewDiagnostic(changeKey(updated[0]!))).toBeUndefined();

      frameMap.delete(card.id);
      vi.useRealTimers();
      document.body.innerHTML = "";
      for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    });

    it("marks edit as stale when unmatched across ALL documents", async () => {
      vi.useFakeTimers();
      const iframe = createMockFrame();

      const frameMap = getRegisteredFrames() as Map<string, HTMLIFrameElement>;
      const card = addCanvasCard("http://localhost:5173/about");
      frameMap.set(card.id, iframe);

      const missingSelector = '[data-cid="Deleted"][data-src*="Deleted.tsx:1"]';
      const change = makeElementChange({
        selector: missingSelector,
        cid: "Deleted",
        file: "src/Deleted.tsx",
        line: 1,
      });
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      const diagnostic = getPreviewDiagnostic(changeKey(updated[0]!));
      expect(diagnostic?.result.status).toBe("conflict");
      expect(diagnostic?.result.reason).toBe("target-missing");

      frameMap.delete(card.id);
      vi.useRealTimers();
      document.body.innerHTML = "";
      for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    });



    it("retains exact selector and source data on stale changes", async () => {
      vi.useFakeTimers();
      const selector = '[data-cid="Widget"][data-src*="Widget.tsx:5"]';
      const change = makeElementChange({
        selector,
        cid: "Widget",
        file: "src/Widget.tsx",
        line: 5,
        property: "margin",
        rawValue: "16px",
      });
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      const stale = updated.find(isElementChange)!;
      expect(stale.selector).toBe(selector);
      expect(stale.cid).toBe("Widget");
      expect(stale.file).toBe("src/Widget.tsx");
      expect(stale.line).toBe(5);
      expect(stale.property).toBe("margin");
      const diagnostic = getPreviewDiagnostic(changeKey(stale));
      expect(diagnostic?.result.status).toBe("conflict");
      expect(diagnostic?.result.reason).toBe("target-missing");

      vi.useRealTimers();
    });
  });

  describe("token change drift detection", () => {


    it("does NOT falsely claim a stale edit is applied", async () => {
      vi.useFakeTimers();
      const change = makeElementChange({
        selector: '[data-cid="Gone"][data-src*="Gone.tsx:1"]',
      });
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getPreviewDiagnostic(changeKey(updated[0]!))?.result.status).toBe("conflict");

      vi.useRealTimers();
    });
  });

  describe("cancelStaleDetection", () => {
    it("cancels the verification timer", () => {
      vi.useFakeTimers();
      const change = makeElementChange();
      restoreChangeRecords([change]);

      startStaleDetection(getChangesList());
      expect(isVerificationPending()).toBe(true);

      cancelStaleDetection();
      expect(isVerificationPending()).toBe(false);

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getPreviewDiagnostic(changeKey(updated[0]!))).toBeUndefined();

      vi.useRealTimers();
    });
  });

  it("does not schedule selector verification for component prop changes", () => {
    startStaleDetection([makeComponentChange()]);
    expect(isVerificationPending()).toBe(false);
  });
});
