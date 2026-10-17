// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PreviewResult } from "../projection/managedStylesheet.ts";
import type { PreviewAttempt } from "./previewDiagnostics.ts";
import type { ElementChangeRecord } from "./types.ts";
import { verifyPreviewChanges } from "./previewVerification.ts";

function change(property: string): ElementChangeRecord {
  return {
    cid: "Button",
    file: "src/Button.tsx",
    line: 1,
    selector: '[data-cid="Button"]',
    property,
    oldToken: null,
    newToken: null,
    rawValue: "red",
    source: { file: "src/Button.tsx", line: 1, component: "Button" },
  };
}

function attempt(): PreviewAttempt {
  return {
    logicalDocument: "canvas:card-1",
    sessionId: "session-1",
    draftId: "draft-1",
    draftRevision: 4,
    attempt: 1,
  };
}

const applied: PreviewResult = { requestedValue: "red", computedValue: "rgb(255, 0, 0)", status: "applied" };
const animation: PreviewResult = { requestedValue: "red", computedValue: "rgb(0, 0, 0)", status: "conflict", reason: "animation" };

describe("verifyPreviewChanges", () => {
  it("publishes one diagnostic per previewable change against the shared attempt", () => {
    const published: { key: string; result: PreviewResult; attempt: PreviewAttempt }[] = [];
    verifyPreviewChanges({
      changes: [change("color"), change("background")],
      document,
      attempt: attempt(),
      targetFor: () => null,
    }, {
      verify: () => applied,
      publish: (shared, key, result) => published.push({ key, result, attempt: shared }),
    });

    expect(published).toHaveLength(2);
    expect(new Set(published.map((entry) => entry.attempt)).size).toBe(1);
  });

  it("retries an animation conflict once the browser settles", () => {
    const results = [animation, applied];
    const published: PreviewResult[] = [];
    const scheduled: (() => void)[] = [];
    verifyPreviewChanges({
      changes: [change("color")],
      document,
      attempt: attempt(),
      targetFor: () => null,
      retryAnimation: (run) => scheduled.push(run),
    }, {
      verify: () => results.shift() ?? null,
      publish: (_attempt, _key, result) => published.push(result),
    });

    expect(published).toEqual([animation]);
    scheduled[0]!();
    expect(published).toEqual([animation, applied]);
  });

  it("drops a settled retry when a newer revision replaced the attempt", () => {
    const published: PreviewResult[] = [];
    const scheduled: (() => void)[] = [];
    verifyPreviewChanges({
      changes: [change("color")],
      document,
      attempt: attempt(),
      targetFor: () => null,
      isCurrent: () => false,
      retryAnimation: (run) => scheduled.push(run),
    }, {
      verify: () => animation,
      publish: (_attempt, _key, result) => published.push(result),
    });

    scheduled[0]!();
    expect(published).toEqual([animation]);
  });

  it("resolves each change against its own target in the requested document", () => {
    const target = document.createElement("button");
    document.body.append(target);
    const seen: (HTMLElement | null)[] = [];
    verifyPreviewChanges({
      changes: [change("color"), change("background")],
      document,
      attempt: attempt(),
      targetFor: () => target,
    }, {
      verify: (_change, resolved) => {
        seen.push(resolved);
        return null;
      },
      publish: () => undefined,
    });

    expect(seen).toEqual([target, target]);
  });
});
