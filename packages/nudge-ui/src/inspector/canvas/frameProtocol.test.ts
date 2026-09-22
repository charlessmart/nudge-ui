import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  isElementClickMessage,
  isInlineTextIntentMessage,
  isKeyboardShortcutMessage,
  isProjectionAppliedMessage,
  isRenderedInstanceProjectionReportMessage,
  isRendererMessageFor,
  isStructuralProjectionReportMessage,
  isTextProjectionReportMessage,
} from "./frameProtocol.ts";
const identity = {
  projectId: "project-a",
  workspaceId: "workspace-a",
  cardId: "card-a",
};


describe("isRendererMessageFor", () => {
  it("accepts a renderer message for the expected canvas card", () => {
    expect(isRendererMessageFor({
      type: "frame-ready",
      protocolVersion: PROTOCOL_VERSION,
      ...identity,
    }, identity)).toBe(true);
  });

  it.each([
    { projectId: "project-b" },
    { workspaceId: "workspace-b" },
    { cardId: "card-b" },
    { protocolVersion: PROTOCOL_VERSION + 1 },
  ])("rejects a message with a mismatched identity: %o", (override) => {
    expect(isRendererMessageFor({
      type: "frame-ready",
      protocolVersion: PROTOCOL_VERSION,
      ...identity,
      ...override,
    }, identity)).toBe(false);
  });

  it("rejects a v2 renderer message after the durable instance projection change", () => {
    expect(isRendererMessageFor({
      type: "frame-ready",
      protocolVersion: 2,
      ...identity,
    }, identity)).toBe(false);
  });
});

describe("keyboard shortcut schema", () => {
  const message = {
    type: "keyboard-shortcut",
    protocolVersion: PROTOCOL_VERSION,
    phase: "keydown",
    code: "KeyV",
    ...identity,
  };

  it("accepts a supported shortcut for the matching card", () => {
    expect(isKeyboardShortcutMessage(message, identity)).toBe(true);
    expect(isKeyboardShortcutMessage({ ...message, code: "KeyS" }, identity)).toBe(true);
  });

  it.each([
    { phase: "keypress" },
    { code: "KeyX" },
    { localId: "forbidden" },
    { cardId: "card-b" },
  ])("rejects malformed or wrong-card shortcuts: %o", (override) => {
    expect(isKeyboardShortcutMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("element click schema", () => {
  const message = {
    type: "element-click",
    protocolVersion: PROTOCOL_VERSION,
    cid: "Button",
    selector: "button",
    src: "src/Button.tsx:1:1",
    elementId: "r1",
    file: "src/Button.tsx",
    line: 1,
    component: "Button",
    additive: true,
    ...identity,
  };

  it("accepts a boolean additive flag", () => {
    expect(isElementClickMessage(message, identity)).toBe(true);
  });

  it.each([
    { additive: "true" },
    { additive: 1 },
    { line: 1.5 },
    { localId: "forbidden" },
  ])("rejects malformed click data: %o", (override) => {
    expect(isElementClickMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("inline text intent schema", () => {
  const message = {
    type: "inline-text-intent",
    protocolVersion: PROTOCOL_VERSION,
    intent: "double-click",
    cid: "Heading",
    src: "src/Heading.tsx:1:1",
    elementId: "r2",
    point: { x: 12, y: 24 },
    ...identity,
  };

  it("accepts a bounded renderer intent for the matching card", () => {
    expect(isInlineTextIntentMessage(message, identity)).toBe(true);
    expect(isInlineTextIntentMessage({
      ...message,
      intent: "pointer-down",
      clickCount: 2,
      emptyProjectionId: "empty-text-1",
    }, identity)).toBe(true);
  });

  it.each([
    { intent: "click" },
    { point: { x: "12", y: 24 } },
    { point: { x: 12, y: 24, node: "forbidden" } },
    { clickCount: -1 },
    { emptyProjectionId: 1 },
    { localId: "forbidden" },
  ])("rejects malformed inline text data: %o", (override) => {
    expect(isInlineTextIntentMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("structural projection report schema", () => {
  const message = {
    type: "structural-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision: 4,
    reports: [{ changeId: "delete-1", status: "overridden", reason: "react-override" }],
    ...identity,
  };

  it("accepts a versioned JSON-only report for the matching card", () => {
    expect(isStructuralProjectionReportMessage(message, identity)).toBe(true);
  });

  it.each([
    { revision: -1 },
    { reports: [{ changeId: "delete-1", status: "unknown" }] },
    { reports: [{ changeId: "delete-1", status: "applied", node: "forbidden" }] },
    { localId: "forbidden" },
    { cardId: "card-b" },
  ])("rejects malformed or wrong-card diagnostics: %o", (override) => {
    expect(isStructuralProjectionReportMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("rendered-instance projection report schema", () => {
  const message = {
    type: "rendered-instance-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision: 4,
    reports: [{ overrideId: "override-1", status: "overridden" }],
    ...identity,
  };

  it("accepts a versioned CSS-instance diagnostic for the matching card", () => {
    expect(isRenderedInstanceProjectionReportMessage(message, identity)).toBe(true);
  });

  it.each([
    { reports: [{ overrideId: "override-1", status: "unknown" }] },
    { reports: [{ overrideId: "override-1", status: "applied", marker: "forbidden" }] },
    { revision: -1 },
    { cardId: "card-b" },
  ])("rejects malformed or wrong-card CSS-instance diagnostics: %o", (override) => {
    expect(isRenderedInstanceProjectionReportMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("rendered-text projection report schema", () => {
  const message = {
    type: "text-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision: 4,
    reports: [{ changeId: "text-1", status: "overridden" }],
    ...identity,
  };

  it("accepts a versioned JSON-only report for the matching card", () => {
    expect(isTextProjectionReportMessage(message, identity)).toBe(true);
  });

  it.each([
    { reports: [{ changeId: "text-1", status: "unknown" }] },
    { reports: [{ changeId: "text-1", status: "applied", marker: "forbidden" }] },
    { reports: [{ changeId: "", status: "applied" }] },
    { revision: -1 },
    { cardId: "card-b" },
  ])("rejects malformed or wrong-card text diagnostics: %o", (override) => {
    expect(isTextProjectionReportMessage({ ...message, ...override }, identity)).toBe(false);
  });
});

describe("projection acknowledgement schema", () => {
  const message = {
    type: "projection-applied",
    protocolVersion: PROTOCOL_VERSION,
    revision: 4,
    ...identity,
  };

  it("accepts a versioned acknowledgement for the matching card", () => {
    expect(isProjectionAppliedMessage(message, identity)).toBe(true);
  });

  it.each([
    { revision: -1 },
    { revision: 1.5 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { localId: "forbidden" },
    { cardId: "card-b" },
  ])("rejects malformed or wrong-card acknowledgements: %o", (override) => {
    expect(isProjectionAppliedMessage({ ...message, ...override }, identity)).toBe(false);
  });
});
