// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendChange, clearActiveDraft, getChangesList, resetDrafts } from "../drafts/store.ts";
import type { ChangeRecord, ElementChangeRecord } from "../changes/types.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  applyStructuralProjection,
  createStructuralDelete,
  getStructuralChanges,
  resetStructuralDeleteProjection,
} from "../projection/structuralProjection.ts";
import {
  captureHandoffOwner,
  verifiedChangeKeys,
  verifyAndReconcileHandoff,
  type HandoffSnapshot,
} from "./handoffVerification.ts";

function snapshot(
  changes: readonly ChangeRecord[],
  structuralChanges: readonly StructuralChange[] = [],
): HandoffSnapshot {
  return { owner: captureHandoffOwner(), changes, structuralChanges };
}

function styleChange(property: string, rawValue: string): ElementChangeRecord {
  return {
    cid: "Card",
    file: "src/Card.tsx",
    line: 4,
    selector: '[data-cid="Card"]',
    property,
    oldToken: null,
    newToken: null,
    oldRawValue: property === "color" ? "black" : "0px",
    rawValue,
    source: { file: "src/Card.tsx", line: 4, component: "Card" },
  };
}

function movedCard(src: string): HTMLElement {
  const card = document.createElement("div");
  card.dataset.cid = "Card";
  card.dataset.src = src;
  card.dataset.cprops = 'className="card"';
  return card;
}

function movedStyleChange(): ElementChangeRecord {
  return {
    ...styleChange("color", "rgb(255, 0, 0)"),
    column: 3,
    selector: '[data-cid="Card"][data-src="src/Card.tsx:4:3"]',
    sourceEvidence: { tagName: "div", props: 'className="card"' },
  };
}

function addItem(text: string): HTMLElement {
  const el = document.createElement("button");
  el.dataset.cid = "RepeatedItem";
  el.dataset.src = "src/App.tsx:12:5";
  el.textContent = text;
  document.body.append(el);
  return el;
}

describe("handoff verification", () => {
  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    configureNudgeUiRuntime({ ...getNudgeUiRuntimeConfig(), demo: true });
    resetDrafts();
    resetStructuralDeleteProjection();
    document.head.replaceChildren();
    const card = document.createElement("div");
    card.dataset.cid = "Card";
    document.body.replaceChildren(card);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-nudge-ui-editor");
    clearActiveDraft();
    resetStructuralDeleteProjection();
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("does not project application edits into the controller shell", () => {
    document.documentElement.setAttribute("data-nudge-ui-editor", "");
    const change = styleChange("color", "rgb(255, 0, 0)");
    appendChange(change);

    expect(document.getElementById("nudge-ui-styles")).toBeNull();
    expect(verifiedChangeKeys([change])).toEqual(new Set());
    document.documentElement.removeAttribute("data-nudge-ui-editor");
  });

  it("removes only the sent record that the refreshed source now renders", async () => {
    const sent = styleChange("color", "rgb(255, 0, 0)");
    const unresolved = styleChange("margin-left", "12px");
    appendChange(sent);
    appendChange(unresolved);
    const handoff = snapshot(getChangesList());

    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(1);
    expect(getChangesList()).toMatchObject([{ property: "margin-left", rawValue: "12px" }]);
  });

  it("retains a sent change if the page navigates during verification", async () => {
    const sent = styleChange("color", "rgb(255, 0, 0)");
    appendChange(sent);
    const handoff = snapshot(getChangesList());
    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      window.history.replaceState({}, "", "/other");
      callback(0);
      return 1;
    });

    expect(await verifyAndReconcileHandoff(handoff)).toBe(0);
    expect(getChangesList()).toEqual([sent]);
  });

  it("preserves a newer value for the same change key", async () => {
    const sent = styleChange("color", "rgb(255, 0, 0)");
    appendChange(sent);
    const handoff = snapshot(getChangesList());

    // A newer canonical record for the same key must not be mistaken for the dispatched snapshot.
    appendChange(styleChange("color", "rgb(0, 0, 255)"));

    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getChangesList()).toMatchObject([{
      property: "color",
      rawValue: "rgb(0, 0, 255)",
    }]);
  });

  it("reconciles only the structural delete that is absent from its authored route", async () => {
    document.body.replaceChildren();
    const applied = addItem("0.1");
    const pending = addItem("0.2");
    createStructuralDelete(applied, "delete-applied");
    createStructuralDelete(pending, "delete-pending");
    applyStructuralProjection(document, getStructuralChanges());
    expect(applied.isConnected).toBe(false);
    expect(pending.isConnected).toBe(false);
    const handoff = snapshot([], getStructuralChanges());

    // The source applied only the first delete; placeholders were created in snapshot order.
    const placeholders = Array.from(document.body.childNodes)
      .filter((node): node is Comment => node.nodeType === node.COMMENT_NODE);
    expect(placeholders).toHaveLength(2);
    placeholders[0]!.remove();

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(1);
    expect(getStructuralChanges().map((change) => change.id)).toEqual(["delete-pending"]);
    expect(applied.isConnected).toBe(false);
    expect(pending.isConnected).toBe(false);

  });

  it("keeps a structural delete while a different route is active", async () => {
    window.history.replaceState({}, "", "/authored");
    document.body.replaceChildren();
    const target = addItem("0.1");
    const change = createStructuralDelete(target, "delete-other-route")!;
    applyStructuralProjection(document, getStructuralChanges());
    const handoff = snapshot([], getStructuralChanges());
    const placeholder = Array.from(document.body.childNodes)
      .find((node): node is Comment => node.nodeType === node.COMMENT_NODE);
    placeholder?.remove();
    expect(target.isConnected).toBe(false);
    window.history.replaceState({}, "", "/other");

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getStructuralChanges()).toEqual([change]);
  });

  it("keeps a structural delete when the same route has different navigation state", async () => {
    window.history.replaceState({ panel: "closed" }, "", "/authored#first");
    document.body.replaceChildren();
    const target = addItem("0.1");
    const change = createStructuralDelete(target, "delete-other-state")!;
    applyStructuralProjection(document, getStructuralChanges());
    const handoff = snapshot([], getStructuralChanges());
    const placeholder = Array.from(document.body.childNodes)
      .find((node): node is Comment => node.nodeType === node.COMMENT_NODE);
    placeholder?.remove();
    expect(target.isConnected).toBe(false);

    window.history.replaceState({ panel: "open" }, "", "/authored#second");

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getStructuralChanges()).toEqual([change]);
  });

  it("keeps a structural delete when the same route renders a different state", async () => {
    window.history.replaceState({}, "", "/authored");
    document.body.replaceChildren();
    const target = addItem("0.1");
    const change = createStructuralDelete(target, "delete-rendered-state")!;
    applyStructuralProjection(document, getStructuralChanges());
    const handoff = snapshot([], getStructuralChanges());
    const placeholder = Array.from(document.body.childNodes)
      .find((node): node is Comment => node.nodeType === node.COMMENT_NODE);
    placeholder?.remove();
    document.body.append(addItem("0.2"));

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getStructuralChanges()).toEqual([change]);
  });

  it("reconciles a nested delete when the surrounding rendered view is unchanged", async () => {
    window.history.replaceState({}, "", "/authored");
    const parent = document.createElement("section");
    parent.dataset.cid = "Card";
    parent.dataset.src = "src/Card.tsx:4:1";
    const target = document.createElement("button");
    target.dataset.cid = "RepeatedItem";
    target.dataset.src = "src/App.tsx:12:5";
    target.textContent = "0.1";
    parent.append(target);
    document.body.replaceChildren(parent);

    const change = createStructuralDelete(target, "delete-nested")!;
    applyStructuralProjection(document, getStructuralChanges());
    const handoff = snapshot([], getStructuralChanges());
    const placeholder = Array.from(parent.childNodes)
      .find((node): node is Comment => node.nodeType === node.COMMENT_NODE);
    placeholder?.remove();

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(1);
    expect(getStructuralChanges()).toEqual([]);
  });

  it("verifies a style edit whose source site moved to another line", async () => {
    const card = movedCard("src/Card.tsx:9:3");
    document.body.replaceChildren(card);
    appendChange(movedStyleChange());
    const handoff = snapshot(getChangesList());
    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(1);
    expect(getChangesList()).toEqual([]);
  });

  it("keeps a moved style edit when its authored evidence matches several lines", async () => {
    document.body.replaceChildren(movedCard("src/Card.tsx:9:3"), movedCard("src/Card.tsx:14:3"));
    appendChange(movedStyleChange());
    const handoff = snapshot(getChangesList());
    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Card"] { color: rgb(255, 0, 0); }';
    document.head.prepend(authored);

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getChangesList()).toHaveLength(1);
  });

  it("keeps a structural delete whose element only moved to another line", async () => {
    document.body.replaceChildren();
    const target = addItem("0.1");
    const change = createStructuralDelete(target, "delete-moved")!;
    applyStructuralProjection(document, getStructuralChanges());
    const handoff = snapshot([], getStructuralChanges());
    target.dataset.src = "src/App.tsx:15:5";

    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getStructuralChanges()).toEqual([change]);
  });

  it("keeps a structural delete whose element the source still renders", async () => {
    document.body.replaceChildren();
    const target = addItem("0.1");
    const change = createStructuralDelete(target, "delete-1")!;
    applyStructuralProjection(document, getStructuralChanges());
    expect(target.isConnected).toBe(false);
    const handoff = snapshot([], getStructuralChanges());

    // The source did not apply the delete, so lifting the preview returns the element.
    await expect(verifyAndReconcileHandoff(handoff)).resolves.toBe(0);
    expect(getStructuralChanges()).toEqual([change]);
    expect(target.isConnected).toBe(false);
  });
});
