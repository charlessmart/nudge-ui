// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, hydrateCanvasStore, updateCardUrl } from "../canvas/canvasStore.ts";
import { draftChangeStore } from "../changes/draftChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { loadDrafts, activateDraftForCard, getDraftForCard, getDraftContentsForCard, resetDrafts } from "./store.ts";
import { startWorkspaceController } from "../workspace/controller.ts";
import { applicationTarget } from "./model.ts";
import { addLinkedFrame } from "../workspace/commands.ts";
import { captureHandoffOwner, recordAgentDispatch, verifyAndReconcileAgentDispatch, resetAgentVerification } from "../agent/verification.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

const initial = getNudgeUiRuntimeConfig();
let controller: ReturnType<typeof startWorkspaceController> | undefined;
const change = (value: string): ElementChangeRecord => ({
  cid: "Heading", file: "Heading.tsx", line: 1, selector: "h1", property: "color",
  oldToken: null, newToken: null, rawValue: value, source: { file: "Heading.tsx", line: 1, component: "Heading" },
});
beforeEach(() => {
  document.documentElement.setAttribute("data-nudge-ui-editor", "");
  configureNudgeUiRuntime({ ...initial, demo: true });
  resetDrafts(); resetAgentVerification();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
});
afterEach(() => {
  controller?.dispose(); controller = undefined;
  resetDrafts(); resetAgentVerification();
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  configureNudgeUiRuntime(initial);
  vi.restoreAllMocks();
});

it("shares a page's changes across breakpoints and keeps another page independent", () => {
  const first = activateIframeWorkspace(window.location.origin + "/playground", { width: 800, height: 600 })!;
  loadDrafts("pages", { persistent: false });
  activateDraftForCard(first.id);
  draftChangeStore.commitChangeRecords([change("red")]);
  const linked = addLinkedFrame(first.id)!;
  const other = activateIframeWorkspace(window.location.origin + "/examples", { width: 800, height: 600 })!;
  activateDraftForCard(other.id);
  expect(draftChangeStore.getSnapshot().changes).toEqual([]);
  draftChangeStore.commitChangeRecords([change("blue")]);
  activateDraftForCard(linked.id);
  expect(draftChangeStore.getSnapshot().changes).toMatchObject([{ rawValue: "red" }]);
  expect(getDraftForCard(first.id)?.id).toBe(getDraftForCard(linked.id)?.id);
  expect(getDraftContentsForCard(other.id)?.changes).toMatchObject([{ rawValue: "blue" }]);
});

it("retains the sent page's changes when its only frame navigates elsewhere", async () => {
  const first = activateIframeWorkspace(window.location.origin + "/playground", { width: 800, height: 600 })!;
  controller = startWorkspaceController();
  draftChangeStore.commitChangeRecords([change("red")]);
  const owner = captureHandoffOwner(first.id);
  recordAgentDispatch(42, [change("red")], [], owner);
  updateCardUrl(first.id, window.location.origin + "/examples");
  draftChangeStore.commitChangeRecords([change("blue")]);
  expect(await verifyAndReconcileAgentDispatch(42)).toBe(0);
  expect(getDraftContentsForCard(first.id)?.changes).toMatchObject([{ rawValue: "blue" }]);
  updateCardUrl(first.id, window.location.origin + "/playground");
  expect(getDraftContentsForCard(first.id)?.changes).toMatchObject([{ rawValue: "red" }]);
});

it("uses query values as page identity while ignoring hashes and the editor parameter", () => {
  expect(applicationTarget("http://localhost/examples?b=2&a=1&nudge-ui=editor#section"))
    .toEqual(applicationTarget("http://localhost/examples?a=1&b=2"));
  expect(applicationTarget("http://localhost/examples?a=1"))
    .not.toEqual(applicationTarget("http://localhost/examples?a=2"));
});

it("returns a navigated frame to its original page when undoing that page's edit", () => {
  const first = activateIframeWorkspace(window.location.origin + "/playground", { width: 800, height: 600 })!;
  controller = startWorkspaceController();
  draftChangeStore.commitChangeRecords([change("red")]);
  updateCardUrl(first.id, window.location.origin + "/examples");
  expect(draftChangeStore.undoChange()).toBe(true);
  expect(getDraftForCard(first.id)?.target).toMatchObject({ route: window.location.origin + "/playground" });
  expect(getDraftContentsForCard(first.id)?.changes).toHaveLength(0);
  expect(draftChangeStore.redoChange()).toBe(true);
  expect(getDraftContentsForCard(first.id)?.changes).toMatchObject([{ rawValue: "red" }]);
});
