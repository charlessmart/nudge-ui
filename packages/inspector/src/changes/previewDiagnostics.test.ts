import { beforeEach, describe, expect, it } from "vitest";
import type { ElementChangeRecord } from "./types.ts";
import { changeKey } from "./model.ts";
import {
  beginPreviewAttempt,
  getHostPreviewDocument,
  getPreviewDiagnostic,
  invalidatePreviewDocumentSession,
  publishPreviewDiagnostic,
  resetPreviewDiagnostics,
  startPreviewDocumentSession,
} from "./previewDiagnostics.ts";
import {
  resetWorkspaceChanges,
  restoreWorkspaceChanges,
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

    expect(publishPreviewDiagnostic(first, changeKey(change), result)).toBe(false);
    expect(publishPreviewDiagnostic(second, changeKey(change), result)).toBe(true);
    expect(getPreviewDiagnostic(changeKey(change))?.attempt).toBe(2);
  });

  it("invalidates stored results when canonical workspace revision advances", () => {
    const document = getHostPreviewDocument();
    const attempt = beginPreviewAttempt(document)!;
    publishPreviewDiagnostic(attempt, changeKey(change), result);

    restoreWorkspaceChanges({ changes: [change], structuralChanges: [] }, () => undefined);

    expect(getPreviewDiagnostic(changeKey(change))).toBeUndefined();
    expect(publishPreviewDiagnostic(attempt, changeKey(change), result)).toBe(false);
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
});
