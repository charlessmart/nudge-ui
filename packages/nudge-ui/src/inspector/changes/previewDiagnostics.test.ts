// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import { changeKey } from "./model.ts";
import {
  beginPreviewAttempt,
  clearPreviewDiagnostics,
  getPreviewDiagnostic,
  getPreviewDiagnosticRevision,
  invalidatePreviewDocumentSession,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
  startPreviewDocumentSession,
  subscribePreviewDiagnostics,
  getAnyPreviewDiagnostic,
} from "./previewDiagnostics.ts";
import { appendChanges, getActiveDraftChanges, resetDrafts, undo } from "../drafts/store.ts";

const TEST_FRAME = { logicalDocument: "test-frame", sessionId: "test-session" };

/** A started preview document, standing in for a frame. */
function testFrameDocument(): typeof TEST_FRAME {
  startPreviewDocumentSession(TEST_FRAME);
  return TEST_FRAME;
}

const change: ElementChangeRecord = {
  cid: "Button",
  file: "src/Button.tsx",
  line: 1,
  selector: '[data-cid="Button"]',
  property: "color",
  oldToken: null,
  newToken: null,
  oldRawValue: "black",
  rawValue: "red",
  source: { file: "src/Button.tsx", line: 1, component: "Button" },
};

const result = {
  status: "applied" as const,
  requestedValue: "red",
  computedValue: "red",
};

describe("preview diagnostics", () => {
  beforeEach(() => {
    resetDrafts();
    resetPreviewDiagnostics();
  });

  it("stores a result with the active revision, document session, and attempt", () => {
    const document = testFrameDocument();
    const attempt = beginPreviewAttempt(document)!;

    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(true);
    expect(getAnyPreviewDiagnostic(changeKey(change))).toMatchObject({
      changeKey: changeKey(change),
      logicalDocument: document.logicalDocument,
      sessionId: document.sessionId,
      draftRevision: 0,
      attempt: 1,
      result,
    });
  });

  it("rejects a late result after a newer attempt starts", () => {
    const document = testFrameDocument();
    const first = beginPreviewAttempt(document)!;
    const second = beginPreviewAttempt(document)!;

    expect(getAnyPreviewDiagnostic(changeKey(change))).toBeUndefined();
    expect(publishPreviewDiagnostic(first, changeKey(change), result)).toBe(false);
    expect(publishPreviewDiagnostic(second, changeKey(change), result)).toBe(true);
    expect(getAnyPreviewDiagnostic(changeKey(change))?.attempt).toBe(2);
  });

  it("preserves diagnostics across workspace revisions until explicitly cleared", () => {
    const document = testFrameDocument();
    const attempt = beginPreviewAttempt(document)!;
    publishPreviewDiagnostic(attempt, changeKey(change), result);

    appendChanges([change]);

    // New commits must not delete earlier diagnostics; the revision stamp rejects late publishes per key.
    expect(getAnyPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(false);

    clearPreviewDiagnostics();
    expect(getAnyPreviewDiagnostic(changeKey(change))).toBeUndefined();
  });

  it("keeps both diagnostics when two changes commit in sequence", () => {
    const secondChange: ElementChangeRecord = {
      ...change,
      property: "background",
      rawValue: "blue",
      oldRawValue: "white",
    };
    expect(appendChanges([change])).toBe("applied");
    const firstAttempt = beginPreviewAttempt(testFrameDocument())!;
    expect(publishPreviewDiagnostic(firstAttempt, changeKey(change), result)).toBe(true);

    expect(appendChanges([secondChange])).toBe("applied");
    expect(getAnyPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    const secondAttempt = beginPreviewAttempt(testFrameDocument())!;
    const secondResult = { ...result, requestedValue: "blue", computedValue: "blue" };
    expect(publishPreviewDiagnostic(secondAttempt, changeKey(secondChange), secondResult)).toBe(true);
    expect(getAnyPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    expect(getAnyPreviewDiagnostic(changeKey(secondChange))?.result).toMatchObject(secondResult);
  });

  it("does not notify when reading a diagnostic", () => {
    const document = testFrameDocument();
    const attempt = beginPreviewAttempt(document)!;
    publishPreviewDiagnostic(attempt, changeKey(change), result);
    const listener = vi.fn();
    subscribePreviewDiagnostics(listener);
    listener.mockClear();

    expect(getAnyPreviewDiagnostic(changeKey(change))).toBeDefined();
    expect(getPreviewDiagnosticRevision()).toBeGreaterThan(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("publishes diagnostics without changing canonical state or history", () => {
    expect(appendChanges([change])).toBe("applied");
    const before = getActiveDraftChanges();
    const attempt = beginPreviewAttempt(testFrameDocument())!;

    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(true);
    expect(getActiveDraftChanges()).toEqual(before);
    expect(undo()).toBe(true);
  });

  it("invalidates late results when a logical document receives a new session", () => {
    const firstDocument = { logicalDocument: "canvas:card-1", sessionId: "session-a" };
    const secondDocument = { logicalDocument: "canvas:card-1", sessionId: "session-b" };
    startPreviewDocumentSession(firstDocument);
    const first = beginPreviewAttempt(firstDocument)!;
    publishPreviewDiagnostic(first, changeKey(change), result);

    startPreviewDocumentSession(secondDocument);

    expect(getPreviewDiagnostic(changeKey(change), firstDocument.logicalDocument)).toBeUndefined();
    expect(publishPreviewDiagnostic(first, changeKey(change), result)).toBe(false);
    invalidatePreviewDocumentSession(secondDocument.logicalDocument, secondDocument.sessionId);
    expect(beginPreviewAttempt(secondDocument)).toBeNull();
  });

  it("keeps diagnostics for two Canvas documents separate", () => {
    const firstDocument = { logicalDocument: "canvas:card-1", sessionId: "session-a" };
    const secondDocument = { logicalDocument: "canvas:card-2", sessionId: "session-b" };
    startPreviewDocumentSession(firstDocument);
    startPreviewDocumentSession(secondDocument);
    const first = beginPreviewAttempt(firstDocument)!;
    const second = beginPreviewAttempt(secondDocument)!;
    const firstResult = { ...result, computedValue: "blue" };
    const secondResult = { ...result, computedValue: "green" };

    publishPreviewDiagnostic(first, changeKey(change), firstResult);
    publishPreviewDiagnostic(second, changeKey(change), secondResult);

    expect(getPreviewDiagnostic(changeKey(change), firstDocument.logicalDocument)?.result.computedValue)
      .toBe("blue");
    expect(getPreviewDiagnostic(changeKey(change), secondDocument.logicalDocument)?.result.computedValue)
      .toBe("green");
  });
});
