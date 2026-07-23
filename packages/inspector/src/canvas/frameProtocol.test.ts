import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, isRendererMessageFor } from "./frameProtocol.ts";

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
});
