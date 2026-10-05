// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { activateIframeWorkspace, getCanvasCards, hydrateCanvasStore } from "../canvas/canvasStore.ts";
import { acquireLease, enableWriteGuard, hasWriteLease, releaseLease } from "../canvas/workspaceLease.ts";
import { draftChangeStore } from "../changes/draftChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { getDraftsSnapshot, getDraftContentsForCard, resetDrafts } from "../drafts/store.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { startWorkspaceController } from "./controller.ts";

const initialConfig = getNudgeUiRuntimeConfig();
let controller: ReturnType<typeof startWorkspaceController> | undefined;
const change: ElementChangeRecord = {
  cid: "Heading", file: "src/Heading.tsx", line: 1,
  selector: '[data-cid="Heading"]', property: "color",
  oldToken: null, newToken: null, oldRawValue: "black", rawValue: "red",
  source: { file: "src/Heading.tsx", line: 1, component: "Heading" },
};

beforeEach(() => {
  document.documentElement.setAttribute("data-nudge-ui-editor", "");
  localStorage.clear();
  resetDrafts();
  configureNudgeUiRuntime({ ...initialConfig, projectId: "controller-restart" });
  enableWriteGuard();
  acquireLease();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  activateIframeWorkspace(window.location.href, { width: 800, height: 600 });
});

afterEach(() => {
  controller?.dispose();
  controller = undefined;
  releaseLease();
  resetDrafts();
  localStorage.clear();
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  configureNudgeUiRuntime(initialConfig);
});

it("flushes the newest edits before releasing ownership after a controller restart", () => {
  controller = startWorkspaceController();
  controller.dispose();
  controller = startWorkspaceController();
  draftChangeStore.commitChangeRecords([change]);

  window.dispatchEvent(new Event("beforeunload"));

  const stored = JSON.parse(localStorage.getItem("nudge-ui-drafts:controller-restart:v2") ?? "null");
  expect(stored.drafts[0].contents.changes).toMatchObject([{ rawValue: "red" }]);
  expect(hasWriteLease()).toBe(false);
});

it("initializes demo drafts without saving the workspace or releasing a lease", () => {
  configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), demo: true });
  controller = startWorkspaceController();
  expect(draftChangeStore.commitChangeRecords([change])).toBe("applied");
  window.dispatchEvent(new Event("beforeunload"));
  controller.dispose();

  expect(getDraftsSnapshot().drafts[0]?.contents.changes).toMatchObject([{ rawValue: "red" }]);
  expect(localStorage.getItem("nudge-ui-drafts:controller-restart:v2")).toBeNull();
  expect(localStorage.getItem("nudge-ui:controller-restart:v17")).toBeNull();
  expect(hasWriteLease()).toBe(true);
});

it("reloads drafts saved by another tab when this tab takes over again", () => {
  controller = startWorkspaceController();
  draftChangeStore.commitChangeRecords([change]);
  controller.dispose();
  localStorage.removeItem("nudge-ui-drafts:controller-restart:v2");

  controller = startWorkspaceController();

  expect(getDraftContentsForCard(getCanvasCards()[0]!.id)?.changes).toEqual([]);
});
