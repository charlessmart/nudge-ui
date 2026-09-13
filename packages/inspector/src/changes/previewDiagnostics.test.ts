import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import { changeKey } from "./model.ts";
import {
  beginPreviewAttempt,
  clearPreviewDiagnostics,
  getHostPreviewDocument,
  getPreviewDiagnostic,
  getPreviewDiagnosticRevision,
  invalidatePreviewDocumentSession,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
  startPreviewDocumentSession,
  subscribePreviewDiagnostics,
} from "./previewDiagnostics.ts";
import {
  commitChangeRecords,
  getWorkspaceChanges,
  resetWorkspaceChanges,
  restoreWorkspaceChanges,
  undoWorkspaceChange,
} from "./workspaceChanges.ts";

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
    resetWorkspaceChanges();
    resetPreviewDiagnostics();
  });

  it("stores a result with the active revision, document session, and attempt", () => {
    const document = getHostPreviewDocument();
    const attempt = beginPreviewAttempt(document)!;

    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(true);
    expect(getPreviewDiagnostic(changeKey(change))).toMatchObject({
      changeKey: changeKey(change),
      logicalDocument: "host",
      sessionId: document.sessionId,
      workspaceRevision: 0,
      attempt: 1,
      result,
    });
  });

  it("rejects a late result after a newer attempt starts", () => {
    const document = getHostPreviewDocument();
    const first = beginPreviewAttempt(document)!;
    const second = beginPreviewAttempt(document)!;

    expect(getPreviewDiagnostic(changeKey(change))).toBeUndefined();
    expect(publishPreviewDiagnostic(first, changeKey(change), result)).toBe(false);
    expect(publishPreviewDiagnostic(second, changeKey(change), result)).toBe(true);
    expect(getPreviewDiagnostic(changeKey(change))?.attempt).toBe(2);
  });

  it("preserves diagnostics across workspace revisions until explicitly cleared", () => {
    const document = getHostPreviewDocument();
    const attempt = beginPreviewAttempt(document)!;
    publishPreviewDiagnostic(attempt, changeKey(change), result);

    restoreWorkspaceChanges({ changes: [change], structuralChanges: [] }, () => undefined);

    // A new commit must not delete earlier diagnostics. The revision stamp
    // rejects late publishes per key, but reads survive until overwritten.
    expect(getPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(false);

    clearPreviewDiagnostics();
    expect(getPreviewDiagnostic(changeKey(change))).toBeUndefined();
  });

  it("keeps both diagnostics when two changes commit in sequence", () => {
    const secondChange: ElementChangeRecord = {
      ...change,
      property: "background",
      rawValue: "blue",
      oldRawValue: "white",
    };
    expect(commitChangeRecords([change], () => undefined)).toBe("applied");
    const firstAttempt = beginPreviewAttempt(getHostPreviewDocument())!;
    expect(publishPreviewDiagnostic(firstAttempt, changeKey(change), result)).toBe(true);

    expect(commitChangeRecords([secondChange], () => undefined)).toBe("applied");
    // Earlier diagnostics survive the second commit; the new change verifies
    // at the new revision without wiping the first.
    expect(getPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    const secondAttempt = beginPreviewAttempt(getHostPreviewDocument())!;
    const secondResult = { ...result, requestedValue: "blue", computedValue: "blue" };
    expect(publishPreviewDiagnostic(secondAttempt, changeKey(secondChange), secondResult)).toBe(true);
    expect(getPreviewDiagnostic(changeKey(change))?.result).toMatchObject(result);
    expect(getPreviewDiagnostic(changeKey(secondChange))?.result).toMatchObject(secondResult);
  });

  it("does not notify when reading a diagnostic", () => {
    const document = getHostPreviewDocument();
    const attempt = beginPreviewAttempt(document)!;
    publishPreviewDiagnostic(attempt, changeKey(change), result);
    const listener = vi.fn();
    subscribePreviewDiagnostics(listener);
    listener.mockClear();

    expect(getPreviewDiagnostic(changeKey(change))).toBeDefined();
    expect(getPreviewDiagnosticRevision()).toBeGreaterThan(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it("publishes diagnostics without changing canonical state or history", () => {
    expect(commitChangeRecords([change], () => undefined)).toBe("applied");
    const before = getWorkspaceChanges();
    const attempt = beginPreviewAttempt(getHostPreviewDocument())!;

    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(true);
    expect(getWorkspaceChanges()).toEqual(before);
    expect(undoWorkspaceChange(() => undefined)).toBe(true);
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
