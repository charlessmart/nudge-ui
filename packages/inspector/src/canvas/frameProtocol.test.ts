import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  isRenderedInstanceProjectionReportMessage,
  isRendererMessageFor,
  isStructuralProjectionReportMessage,
  isTextProjectionReportMessage,
} from "./frameProtocol.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";

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

describe("structural projection report schema", () => {
  const message = {
    type: "structural-projection-report",
    protocolVersion: PROTOCOL_VERSION,
    revision: 4,
    reports: [{ changeId: "delete-1", status: "overridden" }],
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
