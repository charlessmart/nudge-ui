// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it } from "vitest";
import { activateIframeWorkspace, addCanvasVariation, hydrateCanvasStore, selectCard } from "../canvas/canvasStore.ts";
import { workspaceChangeStore, resetWorkspaceChanges } from "../changes/workspaceChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { activateDraftForCard, createStudyDraft, getWorkspaceForCard, initializeDrafts, resetDrafts } from "./store.ts";
import { recordAgentDispatch, resetAgentVerification, verifyAndReconcileAgentDispatch } from "../agent/verification.ts";
import { clearClipboardHandoff, getClipboardHandoffSnapshot, recordClipboardHandoff, startClipboardHandoffController } from "../prompt/clipboardHandoff.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";

const edit: ElementChangeRecord = {
  cid: "Heading", file: "src/Heading.tsx", line: 1, selector: '[data-cid="Heading"]',
  property: "color", oldToken: null, newToken: null, oldRawValue: "rgb(0, 0, 0)", rawValue: "rgb(255, 0, 0)",
  source: { file: "src/Heading.tsx", line: 1, component: "Heading" },
};
let runtime: ReturnType<typeof getNudgeUiRuntimeConfig>;
let stop: (() => void) | undefined;
beforeEach(() => {
  setNudgeUiHostDevFlag(true);
  runtime = getNudgeUiRuntimeConfig();
  configureNudgeUiRuntime({ ...runtime, demo: true });
  resetDrafts(); resetWorkspaceChanges(); resetAgentVerification(); clearClipboardHandoff();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  document.head.innerHTML = '<style>[data-cid="Heading"] { color: rgb(255, 0, 0); }</style>';
  document.body.innerHTML = '<h1 data-cid="Heading">Heading</h1>';
});
afterEach(() => { configureNudgeUiRuntime(runtime); stop?.(); stop=undefined; resetDrafts(); resetWorkspaceChanges(); resetAgentVerification(); clearClipboardHandoff(); });

it("reconciles the sent draft after switching to an independent draft with identical intent", async () => {
  const original = activateIframeWorkspace(window.location.href, {width:800,height:600})!;
  initializeDrafts("completion-switch", [original.id], {persistent:false});
  activateDraftForCard(original.id);
  workspaceChangeStore.commitChangeRecords([edit]);
  recordAgentDispatch(123, [edit]);
  const study = addCanvasVariation(original.id, "11111111-1111-1111-1111-111111111111")!;
  createStudyDraft(original.id, study.id, study.content.kind === "study" ? study.content.artifactId : "");
  selectCard(study.id); activateDraftForCard(study.id);
  workspaceChangeStore.commitChangeRecords([edit]);
  await verifyAndReconcileAgentDispatch(123);
  expect.soft(getWorkspaceForCard(original.id)?.changes, "The sent live draft should reconcile").toHaveLength(0);
  expect.soft(getWorkspaceForCard(study.id)?.changes, "The independent study should retain its identical intent").toHaveLength(1);
});

it("preserves the copied draft handoff when another draft becomes active", () => {
  const original = activateIframeWorkspace(window.location.href, {width:800,height:600})!;
  initializeDrafts("clipboard-switch", [original.id], {persistent:false});
  activateDraftForCard(original.id);
  workspaceChangeStore.commitChangeRecords([edit]);
  const study = addCanvasVariation(original.id, "22222222-2222-2222-2222-222222222222")!;
  createStudyDraft(original.id, study.id, study.content.kind === "study" ? study.content.artifactId : "");
  stop = startClipboardHandoffController(document);
  recordClipboardHandoff([edit]);
  selectCard(study.id); activateDraftForCard(study.id);
  expect(getClipboardHandoffSnapshot(), "Switching drafts must preserve the originating handoff").not.toBeNull();
});
