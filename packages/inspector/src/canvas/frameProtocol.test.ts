import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, isRendererMessageFor } from "./frameProtocol.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";

const identity = {
  projectId: "project-a",
  workspaceId: "workspace-a",
  cardId: "card-a",
};

describe("ElementClickMessage schema", () => {
  it("carries instanceIndex for scoped controller resolution", () => {
    const msg: ElementClickMessage = {
      type: "element-click",
      protocolVersion: PROTOCOL_VERSION,
      cid: "Button",
      selector: '[data-cid="Button"]',
      src: "/src/Button.tsx:32:5",
      instanceIndex: 3,
      file: "/src/Button.tsx",
      line: 32,
      component: "Button",
      ...identity,
    };
    expect(msg.instanceIndex).toBe(3);
  });
});

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
