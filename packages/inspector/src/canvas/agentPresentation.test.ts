// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import {
  acknowledgeAgentRendererReady,
  createAgentPresentationAdapter,
  presentAgentComparisonGroup,
  readCanvasState,
  removeOwnAgentComparisonGroup,
  resetAgentPresentationState,
} from "./agentPresentation.ts";
import {
  addCanvasCard,
  clearCanvasComparisonGroups,
  duplicateCard,
  getCanvasCards,
  getCanvasComparisonGroups,
  removeCanvasCard,
  setCanvasMode,
} from "./canvasStore.ts";

function resetCanvas(): void {
  resetAgentPresentationState();
  clearCanvasComparisonGroups();
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

  it("appends a labeled route group, preserves user cards, and waits for renderer readiness", async () => {
    const userCard = addCanvasCard(`${window.location.origin}/existing`, "Existing");
    const pending = presentAgentComparisonGroup({
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

    const group = getCanvasComparisonGroups()[0]!;
    expect(group.cardIds).toHaveLength(3);
    const userDuplicate = duplicateCard(group.cardIds[0]!);
    expect(userDuplicate?.comparisonGroupId).toBeUndefined();
    for (const cardId of group.cardIds) acknowledgeAgentRendererReady(cardId);

    const result = await pending;
    expect(result.readiness.allReady).toBe(true);
    expect(readCanvasState()).toMatchObject({
      mode: "canvas",
      groups: [{ id: "agent-landing-pages", label: "Landing page directions", owner: "agent" }],
    });
    expect(getCanvasCards().some((card) => card.id === userCard.id)).toBe(true);

    removeOwnAgentComparisonGroup("agent-landing-pages", "paired-agent");
    expect(getCanvasCards()).toEqual([userCard, userDuplicate]);
  });

  it("rejects a cross-origin route before changing Canvas", async () => {
    await expect(presentAgentComparisonGroup({
      groupId: "agent-bad-route",
      label: "Bad route",
      routes: ["https://example.com/not-this-project"],
    })).rejects.toMatchObject({ code: "invalid-route" });
    expect(getCanvasComparisonGroups()).toEqual([]);
    expect(getCanvasCards()).toEqual([]);
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
