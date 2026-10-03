// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import {
  acknowledgeAgentRendererReady,
  createAgentPresentationAdapter,
  presentAgentRoutes,
  readCanvasState,
  removeOwnAgentGroup,
  resetAgentPresentationState,
} from "./agentPresentation.ts";
import {
  addCanvasCard,
  duplicateCard,
  getCanvasCards,
  removeCanvasCard,
  setCanvasMode,
} from "./canvasStore.ts";

function resetCanvas(): void {
  resetAgentPresentationState();
  for (const card of getCanvasCards()) removeCanvasCard(card.id);
  setCanvasMode("inspect");
}

describe("agent Canvas presentation", () => {
  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    resetCanvas();
  });

  afterEach(() => {
    resetCanvas();
    setNudgeUiHostDevFlag(undefined);
  });

  it("appends a labeled route group as linked frames, preserves user cards, and waits for renderer readiness", async () => {
    const userCard = addCanvasCard(`${window.location.origin}/existing`, "Existing");
    const pending = presentAgentRoutes({
      groupId: "agent-landing-pages",
      label: "Landing page directions",
      routes: [
        { url: "/landing/a", label: "Editorial" },
        { url: "/landing/b", label: "Product-led" },
        { url: "/landing/c", label: "Minimal" },
      ],
      agentId: "paired-agent",
      readyTimeoutMs: 100,
    });

    const cardIds = getCanvasCards()
      .filter((card) => card.groupId === "agent-landing-pages")
      .map((card) => card.id);
    expect(cardIds).toHaveLength(3);
    // A user duplicate of a presented frame is a linked frame of the same
    // group under the linked-frames model, so the group removes it together.
    const userDuplicate = duplicateCard(cardIds[0]!);
    expect(userDuplicate?.groupId).toBe("agent-landing-pages");
    for (const cardId of cardIds) acknowledgeAgentRendererReady(cardId);

    const result = await pending;
    expect(result.readiness.allReady).toBe(true);
    expect(readCanvasState()).toMatchObject({
      mode: "canvas",
      groups: [{ id: "agent-landing-pages", label: "Landing page directions", owner: "agent" }],
    });
    expect(getCanvasCards().some((card) => card.id === userCard.id)).toBe(true);

    removeOwnAgentGroup("agent-landing-pages", "paired-agent");
    expect(getCanvasCards()).toEqual([userCard]);
    expect(readCanvasState().groups).toEqual([]);
  });

  it("rejects a cross-origin route before changing Canvas", async () => {
    await expect(presentAgentRoutes({
      groupId: "agent-bad-route",
      label: "Bad route",
      routes: ["https://example.com/not-this-project"],
    })).rejects.toMatchObject({ code: "invalid-route" });
    expect(getCanvasCards()).toEqual([]);
    expect(readCanvasState().groups).toEqual([]);
  });

  it("executes only the shared Canvas command vocabulary", async () => {
    const adapter = createAgentPresentationAdapter({ projectId: "fixture", agentId: "paired-agent" });
    const result = await adapter.execute({ type: "read-state", commandId: "read-1" });
    expect(result).toEqual({
      commandId: "read-1",
      ok: true,
      state: { mode: "inspect", groups: [], focusedGroupId: null, focusedRouteUrl: null },
    });
    adapter.dispose();
  });
});