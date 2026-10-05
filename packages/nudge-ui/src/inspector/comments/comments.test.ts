// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureRenderedInstance } from "../projection/renderedInstance.ts";
import { generatePrompt } from "../prompt/generatePrompt.ts";
import { commentFingerprint, commentViewport, resolveCommentElement } from "./element.ts";
import { clearComments, commentRoute, getComments, getCommentsForTarget, loadComments, markCommentsHandedOff, removeComment, saveComment, type ElementComment } from "./store.ts";
import { applicationTarget, htmlTarget } from "../drafts/model.ts";
import { projectDraftToDocument } from "../canvas/projection.ts";
import { reconcileComments } from "./verification.ts";

// The renderer transport is the boundary; DOM identity and fingerprinting remain real.
vi.mock("../canvas/projection.ts", () => ({
  projectDraftToDocument: vi.fn(async () => 1),
  isCanvasProjectionRevisionCurrent: () => true,
}));

function target(text = "Save"): HTMLButtonElement {
  const button = document.createElement("button");
  button.dataset.cid = "SaveButton";
  button.dataset.src = "src/App.tsx:10:3";
  button.textContent = text;
  document.body.append(button);
  return button;
}

function comment(element: HTMLElement, note = "Make this easier to find"): ElementComment {
  return {
    id: crypto.randomUUID(), route: commentRoute(document), target: captureRenderedInstance(element)!,
    tag: "button", note, baseline: commentFingerprint(element), viewport: commentViewport(document), handedOff: false,
  };
}

beforeEach(() => {
  for (const item of getComments()) removeComment(item.id);
  document.body.innerHTML = "";
});

describe("element comments", () => {
  it("exports a comment-only prompt with the note, page, and target evidence", () => {
    saveComment(comment(target(), "Change Save to Publish"));
    const prompt = generatePrompt([]);
    expect(prompt).toContain("## Element comments");
    expect(prompt).toContain("Change Save to Publish");
    expect(prompt).toContain("src/App.tsx:10:3");
    expect(prompt).toContain("text `Save`");
    expect(prompt).toContain(document.location.href);
  });

  it("scopes notes to a page or HTML iteration and clears only that target", () => {
    const saved = comment(target());
    const page = { ...saved, id: "page", route: "http://localhost:3000/playground?nudge-ui=on#section" };
    const other = { ...saved, id: "other", route: "http://localhost:3000/examples" };
    const iteration = { ...saved, id: "iteration", route: "http://localhost:3000/__nudge_ui__/artifacts/11111111-1111-1111-1111-111111111111/document.html" };
    for (const note of [page, other, iteration]) saveComment(note);
    const pageTarget = applicationTarget("http://localhost:3000/playground");
    expect(getCommentsForTarget(pageTarget)).toEqual([page]);
    expect(getCommentsForTarget(htmlTarget("11111111-1111-1111-1111-111111111111"))).toEqual([iteration]);
    clearComments(pageTarget);
    expect(getComments()).toEqual([other, iteration]);
  });

  it("persists notes and their handoff status in local storage", () => {
    const saved = comment(target());
    saveComment(saved);
    markCommentsHandedOff([saved]);
    const key = Object.keys(localStorage).find((key) => key.endsWith(":comments:v1"))!;
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{ ...saved, handedOff: true }]);
  });

  it("resolves a handed-off note when its uniquely identified target changes", async () => {
    const button = target();
    const saved = comment(button);
    saveComment(saved);
    markCommentsHandedOff([saved]);
    button.textContent = "Publish";
    await reconcileComments(document);
    expect(getComments()).toEqual([]);
  });

  it("keeps an unsent note when the page changes", async () => {
    const button = target();
    const saved = comment(button);
    saveComment(saved);
    button.textContent = "Publish";
    await reconcileComments(document);
    expect(getComments()).toEqual([saved]);
  });

  it("keeps a handed-off note if only renderer identity or cursor changes", async () => {
    const button = target();
    const saved = comment(button);
    saveComment(saved);
    markCommentsHandedOff([saved]);
    button.dataset.rendererId = "r9";
    button.style.cursor = "ew-resize";
    await reconcileComments(document);
    expect(getComments()).toHaveLength(1);
  });

  it("keeps missing, ambiguous, and differently sized targets", async () => {
    const button = target();
    const saved = comment(button);
    saveComment(saved);
    markCommentsHandedOff([saved]);
    target();
    expect(resolveCommentElement(document, saved.target)).toBeNull();
    await reconcileComments(document);
    expect(getComments()).toHaveLength(1);
    document.body.innerHTML = "";
    await reconcileComments(document);
    expect(getComments()).toHaveLength(1);
    const replacement = target("Publish");
    saveComment({ ...saved, viewport: "different viewport", handedOff: true });
    await reconcileComments(document);
    expect(replacement.textContent).toBe("Publish");
    expect(getComments()).toHaveLength(1);
  });

  it("does not arm a newer note when an earlier handoff finishes", () => {
    const saved = comment(target());
    saveComment({ ...saved, note: "A newer request" });
    markCommentsHandedOff([saved]);
    expect(getComments()[0]?.handedOff).toBe(false);
  });
  it("keeps rehydrated notes when an older reconciliation finishes after takeover", async () => {
    const button = target();
    const saved = comment(button);
    saveComment(saved);
    markCommentsHandedOff([saved]);
    button.textContent = "Publish";
    let startRead!: () => void;
    let finishRead!: (revision: number) => void;
    const started = new Promise<void>((resolve) => { startRead = resolve; });
    const pending = new Promise<number>((resolve) => { finishRead = resolve; });
    vi.mocked(projectDraftToDocument).mockImplementationOnce(() => {
      startRead();
      return pending;
    });
    const checking = reconcileComments(document);
    await started;
    const latest = { ...saved, baseline: "new-owner-baseline", handedOff: true };
    const key = Object.keys(localStorage).find((key) => key.endsWith(":comments:v1"))!;
    localStorage.setItem(key, JSON.stringify([latest]));
    loadComments();
    finishRead(1);
    await checking;

    expect(getComments()).toEqual([latest]);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([latest]);
  });

});
