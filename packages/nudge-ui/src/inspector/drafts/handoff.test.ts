// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { activateIframeWorkspace, addCanvasIteration, hydrateCanvasStore, selectCard } from "../canvas/canvasStore.ts";
import { draftChangeStore, resetDraftChanges } from "../changes/draftChanges.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { activateDraftForCard, getDraftContentsForCard, loadDrafts, resetDrafts } from "./store.ts";
import { recordAgentDispatch, resetAgentVerification, verifyAndReconcileAgentDispatch } from "../agent/verification.ts";
import { clearClipboardHandoff, getClipboardHandoffSnapshot, recordClipboardHandoff, startClipboardHandoffController } from "../prompt/clipboardHandoff.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { getComments, saveComment, type ElementComment } from "../comments/store.ts";
import { captureRenderedInstance } from "../projection/renderedInstance.ts";
import { copyHandoff, prepareHandoff } from "../workspace/handoff.ts";
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
  resetDrafts(); resetDraftChanges(); resetAgentVerification(); clearClipboardHandoff();
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  localStorage.clear();
  document.documentElement.removeAttribute("data-nudge-ui-editor");
  document.head.innerHTML = '<style>[data-cid="Heading"] { color: rgb(255, 0, 0); }</style>';
  document.body.innerHTML = '<h1 data-cid="Heading">Heading</h1>';
});
afterEach(() => { configureNudgeUiRuntime(runtime); stop?.(); stop=undefined; resetDrafts(); resetDraftChanges(); resetAgentVerification(); clearClipboardHandoff(); });

it("reconciles the sent draft after switching to an independent draft with identical intent", async () => {
  const original = activateIframeWorkspace(window.location.href, {width:800,height:600})!;
  loadDrafts("completion-switch", {persistent:false});
  activateDraftForCard(original.id);
  draftChangeStore.commitChangeRecords([edit]);
  recordAgentDispatch(123, [edit]);
  const iteration = addCanvasIteration(original.id, "11111111-1111-1111-1111-111111111111")!;
  selectCard(iteration.id); activateDraftForCard(iteration.id);
  draftChangeStore.commitChangeRecords([edit]);
  await verifyAndReconcileAgentDispatch(123);
  expect.soft(getDraftContentsForCard(original.id)?.changes, "The sent live draft should reconcile").toHaveLength(0);
  expect.soft(getDraftContentsForCard(iteration.id)?.changes, "The independent iteration should retain its identical intent").toHaveLength(1);
});

it("preserves the copied draft handoff when another draft becomes active", () => {
  const original = activateIframeWorkspace(window.location.href, {width:800,height:600})!;
  loadDrafts("clipboard-switch", {persistent:false});
  activateDraftForCard(original.id);
  draftChangeStore.commitChangeRecords([edit]);
  const iteration = addCanvasIteration(original.id, "22222222-2222-2222-2222-222222222222")!;
  stop = startClipboardHandoffController(document);
  recordClipboardHandoff([edit]);
  selectCard(iteration.id); activateDraftForCard(iteration.id);
  expect(getClipboardHandoffSnapshot(), "Switching drafts must preserve the originating handoff").not.toBeNull();
});

it("copies only the originating page's comments after selecting another frame", async () => {
  const original = activateIframeWorkspace(window.location.href, { width: 800, height: 600 })!;
  loadDrafts("comment-handoff", { persistent: false });
  const heading = document.querySelector<HTMLElement>("h1")!;
  heading.dataset.src = "src/Heading.tsx:1:1";
  const note: ElementComment = {
    id: "original-comment", route: window.location.href, target: captureRenderedInstance(heading)!,
    tag: "h1", note: "Improve this heading", baseline: "baseline", viewport: "800:600", handedOff: false,
  };
  saveComment(note);
  saveComment({ ...note, id: "other-comment", route: new URL("/other", window.location.href).href, note: "Keep this for later" });
  const handoff = await prepareHandoff({ cardId: original.id, hints: {}, customInstructions: "", pendingSketches: [] });
  const iteration = addCanvasIteration(original.id, "33333333-3333-3333-3333-333333333333")!;
  selectCard(iteration.id);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    await copyHandoff(handoff);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Improve this heading"));
    expect(handoff.prompt).not.toContain("Keep this for later");
    expect(getComments().find((comment) => comment.id === note.id)?.handedOff).toBe(true);
    expect(getComments().find((comment) => comment.id === "other-comment")?.handedOff).toBe(false);
  } finally {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});
