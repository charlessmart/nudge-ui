// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isElementChange,
  isPreviewableChange,
  type ElementChangeRecord,
  type PreviewableChangeRecord,
  type TokenChangeRecord,
} from "../changes/types.ts";
import { startStaleDetection, cancelStaleDetection, isVerificationPending } from "./staleChangeDetector.ts";
import { getCanvasPreviewDocument, registerCardFrame, unregisterCardFrame } from "./projection.ts";
import { addCanvasCard, removeCanvasCard as removeCanvasCardStore, getCanvasCards } from "./canvasStore.ts";
import { activateDraftForCard, clearActiveDraft, getActiveDraftChanges, getChangesList } from "../drafts/store.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import { makeComponentChange, replaceActiveDraft } from "../changes/_testUtils.ts";
import { changeKey } from "../changes/model.ts";
import {
  beginPreviewAttempt,
  getPreviewDiagnostic,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
  getAnyPreviewDiagnostic,
  startPreviewDocumentSession,
} from "../changes/previewDiagnostics.ts";

const TEST_FRAME = { logicalDocument: "test-frame", sessionId: "test-session" };

/** A started preview document, standing in for a frame. */
function testFrameDocument(): typeof TEST_FRAME {
  startPreviewDocumentSession(TEST_FRAME);
  return TEST_FRAME;
}

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
    important: overrides.important ?? false,
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
    clearActiveDraft();
    resetPreviewDiagnostics();
  });

  afterEach(() => {
    cancelStaleDetection();
    clearActiveDraft();
    resetPreviewDiagnostics();
  });

  describe("element change verification", () => {
    it("marks restored element changes as unverified on start", () => {
      const change = makeElementChange();
      replaceActiveDraft([change]);

      const changes = getPreviewableChanges();
      const attempt = beginPreviewAttempt(testFrameDocument(), getActiveDraftChanges().revision)!;
      publishPreviewDiagnostic(attempt, changeKey(change), {
        status: "applied",
        requestedValue: "var(--color-b)",
        computedValue: "#bbbbbb",
      });
      expect(getAnyPreviewDiagnostic(changeKey(change))?.result.status).toBe("applied");

      startStaleDetection(changes);
      expect(getAnyPreviewDiagnostic(changeKey(change))).toBeUndefined();
    });

    it("does NOT mark a matched edit in the editable page as stale", async () => {
      vi.useFakeTimers();
      setupMockElements('[data-cid="Button"][data-src*="src/Button.tsx:1"]');

      const change = makeElementChange();
      replaceActiveDraft([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getAnyPreviewDiagnostic(changeKey(updated[0]!))).toBeUndefined();

      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    it("matches when element exists in a canvas frame but not the editable page", async () => {
      vi.useFakeTimers();
      const iframe = createMockFrame();
      const selector = '[data-cid="Sidebar"][data-src*="Sidebar.tsx:42"]';
      addElementToFrame(iframe, selector);

      const card = addCanvasCard("http://localhost:5173/about");
      registerCardFrame(card.id, iframe);
      activateDraftForCard(card.id);

      const change = makeElementChange({ selector, cid: "Sidebar", file: "src/Sidebar.tsx", line: 42 });
      replaceActiveDraft([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      const key = changeKey(updated[0]!);
      // A Canvas-only match is verified, not a host conflict.
      expect(getAnyPreviewDiagnostic(key)).toBeUndefined();
      expect(getPreviewDiagnostic(key, getCanvasPreviewDocument(card.id).logicalDocument)).toBeUndefined();

      unregisterCardFrame(card.id);
      vi.useRealTimers();
      document.body.innerHTML = "";
      for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    });

    it("marks edit as stale when unmatched across ALL documents", async () => {
      vi.useFakeTimers();
      const iframe = createMockFrame();

      const card = addCanvasCard("http://localhost:5173/about");
      registerCardFrame(card.id, iframe);
      activateDraftForCard(card.id);

      const missingSelector = '[data-cid="Deleted"][data-src*="Deleted.tsx:1"]';
      const change = makeElementChange({
        selector: missingSelector,
        cid: "Deleted",
        file: "src/Deleted.tsx",
        line: 1,
      });
      replaceActiveDraft([change]);

      startStaleDetection(getChangesList());

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      const diagnostic = getAnyPreviewDiagnostic(changeKey(updated[0]!));
      expect(diagnostic?.result.status).toBe("conflict");
      expect(diagnostic?.result.reason).toBe("target-missing");
      expect(getPreviewDiagnostic(
        changeKey(updated[0]!),
        getCanvasPreviewDocument(card.id).logicalDocument,
      )?.result.reason).toBe("target-missing");

      unregisterCardFrame(card.id);
      vi.useRealTimers();
      document.body.innerHTML = "";
      for (const c of getCanvasCards()) removeCanvasCardStore(c.id);
    });



  });

  describe("cancelStaleDetection", () => {
    it("cancels the verification timer", () => {
      vi.useFakeTimers();
      const change = makeElementChange();
      replaceActiveDraft([change]);

      startStaleDetection(getChangesList());
      expect(isVerificationPending()).toBe(true);

      cancelStaleDetection();
      expect(isVerificationPending()).toBe(false);

      vi.advanceTimersByTime(6000);

      const updated = getPreviewableChanges();
      expect(getAnyPreviewDiagnostic(changeKey(updated[0]!))).toBeUndefined();

      vi.useRealTimers();
    });
  });

  it("does not schedule selector verification for component prop changes", () => {
    startStaleDetection([makeComponentChange()]);
    expect(isVerificationPending()).toBe(false);
  });
});
