// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { componentContracts } from "virtual:nudge-ui-components";
import { registerComponentRuntimeAdapter } from "../componentSemantics/adapterRegistry.ts";
import type { ComponentRuntimeAdapter } from "../componentSemantics/types.ts";
import { clearChanges, getChangesList, redo, undo } from "../changes/changesLog.ts";
import { serializeSession } from "../canvas/sessionStore.ts";
import {
  beginInlineTextEdit,
  beginInlineTextEditFromEmptyProjection,
  disposeInlineTextEdit,
  getInlineTextDiagnostic,
  getInlineTextSession,
} from "./inlineTextEditor.ts";
import { getTextProjectionReports, TEXT_PROJECTION_ATTR } from "../projection/textProjection.ts";

function boundary(meta: Record<string, unknown>, props: Record<string, unknown>) {
  const type = Object.assign(() => null, {
    [Symbol.for("nudge-ui.react-component-boundary")]: true,
  });
  return {
    type,
    memoizedProps: { meta, element: { props } },
  };
}

function fixture(): HTMLElement {
  const element = document.createElement("button");
  element.setAttribute("data-cid", "Button");
  element.textContent = "Publish";
  (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
    type: "button",
    return: boundary({
      callsiteId: "src/App.tsx:4:3",
      componentId: "src/ui/Button#Button",
      componentName: "Button",
      file: "src/App.tsx",
      line: 4,
      column: 3,
      authoredProps: { label: "literal" },
    }, { label: "Publish" }),
  };
  document.body.append(element);
  return element;
}

function mixedFixture(): HTMLElement {
  const element = document.createElement("button");
  element.setAttribute("data-cid", "IconButton");
  element.setAttribute("data-src", "src/App.tsx:9:3");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = "<path d=\"M0 0h4v4H0z\" />";
  const label = document.createElement("span");
  label.textContent = "Save";
  element.append(icon, label);
  (element as unknown as Record<string, unknown>)["__reactFiber$test"] = {
    type: "button",
    return: boundary({
      callsiteId: "src/App.tsx:9:3",
      componentId: "src/ui/IconButton#IconButton",
      componentName: "IconButton",
      file: "src/App.tsx",
      line: 9,
      column: 3,
      authoredProps: { label: "literal" },
    }, { label: "Save" }),
  };
  document.body.append(element);
  return element;
}

function renderedFixture(): HTMLElement {
  const element = document.createElement("p");
  element.setAttribute("data-cid", "Copy");
  element.setAttribute("data-src", "src/Copy.tsx:8:3");
  element.setAttribute("data-cprops", "tone:muted");
  element.textContent = "Original copy";
  document.body.append(element);
  return element;
}

describe("inlineTextEditor", () => {
  beforeEach(() => {
    getInlineTextSession()?.cancel();
    clearChanges();
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "src/ui/Button#Button",
      name: "Button",
      file: "src/ui/Button.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    document.body.replaceChildren();
  });

  it("uses a temporary plaintext host and commits one component change", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    expect("kind" in result).toBe(false);
    const session = getInlineTextSession();
    expect(session).not.toBeNull();
    expect(session?.binding).toMatchObject({ kind: "component-prop", property: "label" });
    expect(element.querySelector('[data-inline-editor="true"]')?.getAttribute("contenteditable"))
      .toBe("plaintext-only");

    const host = element.querySelector('[data-inline-editor="true"]') as HTMLElement;
    host.textContent = "Publish now";
    const change = session!.commit();

    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(element.textContent).toBe("Publish");
    expect(change).toMatchObject({ kind: "component-prop", property: "label", after: "Publish now" });
    expect(getChangesList()).toHaveLength(1);
    expect(serializeSession().changes).toMatchObject([{
      kind: "component-prop",
      property: "label",
      after: "Publish now",
      target: { callsiteId: "src/App.tsx:4:3" },
      authoredAs: "literal",
    }]);
    expect(getInlineTextSession()).toBeNull();
    expect(undo()).toBe(true);
    expect(getChangesList()).toEqual([]);
    expect(redo()).toBe(true);
    expect(getChangesList()).toHaveLength(1);
  });

  it("keeps ordinary key input native while containing inspector key handling", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const documentKeydown = vi.fn();
    document.addEventListener("keydown", documentKeydown);
    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });

    result.host.dispatchEvent(event);

    expect(documentKeydown).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    document.removeEventListener("keydown", documentKeydown);
    result.cancel();
  });

  it("wraps only the selected text node in mixed icon markup", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "src/ui/IconButton#IconButton",
      name: "IconButton",
      file: "src/ui/IconButton.tsx",
      provenance: "typescript",
      props: [{ name: "label", control: "text", options: [], optional: false }],
    });
    const element = mixedFixture();
    const icon = element.querySelector("svg");
    const label = element.querySelector("span");
    const originalTextNode = label?.firstChild;
    const originalSelection = document.getSelection()!;
    const originalRange = document.createRange();
    originalRange.selectNodeContents(originalTextNode!);
    originalSelection.removeAllRanges();
    originalSelection.addRange(originalRange);
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);

    expect(element.querySelector("svg")).toBe(icon);
    expect(element.querySelector("path")).not.toBeNull();
    expect(label?.querySelector('[data-inline-editor="true"]')).not.toBeNull();
    result.host.textContent = "Save file";
    result.commit();

    expect(element.querySelector("svg")).toBe(icon);
    expect(element.querySelector("path")).not.toBeNull();
    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(element.querySelector("span")?.textContent).toBe("Save");
    expect(label?.firstChild).toBe(originalTextNode);
    expect(document.getSelection()?.getRangeAt(0).startContainer).toBe(label);
    expect(getChangesList()).toMatchObject([{ kind: "component-prop", property: "label", after: "Save file" }]);
  });

  it("uses plaintext selection replacement and paste without adding per-input history", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const textNode = result.host.firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 7);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (type: string) => type === "text/plain" ? "Publish now" : "<b>ignored</b>" },
    });
    result.host.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(result.host.textContent).toBe("Publish now");
    result.commit();
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toMatchObject({ kind: "component-prop", after: "Publish now" });
  });

  it("accepts typing, deletion, and autocorrect replacement as one draft", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const textNode = result.host.firstChild;
    if (!(textNode instanceof Text)) throw new Error("inline text node missing");
    const selection = document.getSelection()!;

    const deleteRange = document.createRange();
    deleteRange.setStart(textNode, textNode.length - 1);
    deleteRange.setEnd(textNode, textNode.length);
    selection.removeAllRanges();
    selection.addRange(deleteRange);
    const deletion = new InputEvent("beforeinput", {
      inputType: "deleteContentBackward",
      bubbles: true,
      cancelable: true,
    });
    result.host.dispatchEvent(deletion);
    textNode.nodeValue = "Publis";
    result.host.dispatchEvent(new InputEvent("input", { inputType: "deleteContentBackward", bubbles: true }));

    const replaceRange = document.createRange();
    replaceRange.selectNodeContents(textNode);
    selection.removeAllRanges();
    selection.addRange(replaceRange);
    const replacement = new InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      bubbles: true,
      cancelable: true,
      data: "Publish now",
    });
    result.host.dispatchEvent(replacement);
    textNode.nodeValue = "Publish now";
    result.host.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText", bubbles: true }));

    expect(deletion.defaultPrevented).toBe(false);
    expect(replacement.defaultPrevented).toBe(false);
    expect(result.host.textContent).toBe("Publish now");
    result.commit();
    expect(getChangesList()).toMatchObject([{ kind: "component-prop", after: "Publish now" }]);
    expect(getChangesList()).toHaveLength(1);
  });

  it("rejects paragraph, rich, and cross-host input ranges without corrupting the draft", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const paragraph = new InputEvent("beforeinput", {
      inputType: "insertParagraph",
      bubbles: true,
      cancelable: true,
    });
    result.host.dispatchEvent(paragraph);
    const rich = new InputEvent("beforeinput", {
      inputType: "formatBold",
      bubbles: true,
      cancelable: true,
    });
    result.host.dispatchEvent(rich);
    const outside = document.createElement("p");
    outside.textContent = "outside";
    document.body.append(outside);
    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(outside);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(outsideRange);
    const crossHost = new InputEvent("beforeinput", {
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
    });
    result.host.dispatchEvent(crossHost);

    expect(paragraph.defaultPrevented).toBe(true);
    expect(rich.defaultPrevented).toBe(true);
    expect(crossHost.defaultPrevented).toBe(true);
    expect(result.host.textContent).toBe("Publish");
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "rejected", reason: "cross-host-range" });
    expect(getChangesList()).toEqual([]);
    result.cancel();
  });

  it("fails closed for unknown and empty beforeinput types", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const empty = new InputEvent("beforeinput", { bubbles: true, cancelable: true });
    result.host.dispatchEvent(empty);
    expect(empty.defaultPrevented).toBe(true);
    expect(getInlineTextDiagnostic()).toMatchObject({ reason: "invalid-input-type" });
    const unknown = new InputEvent("beforeinput", {
      inputType: "historyUndo",
      bubbles: true,
      cancelable: true,
    });
    result.host.dispatchEvent(unknown);
    expect(unknown.defaultPrevented).toBe(true);
    expect(getInlineTextDiagnostic()).toMatchObject({ reason: "rich-input" });
    result.cancel();
  });

  it("restores a mutation after a non-cancelable rich or unknown beforeinput", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const selectHost = (): void => {
      const textNode = result.host.firstChild;
      if (!(textNode instanceof Text)) throw new Error("inline text node missing");
      const range = document.createRange();
      range.selectNodeContents(textNode);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
    };

    selectHost();
    const rich = new InputEvent("beforeinput", {
      inputType: "formatBold",
      bubbles: true,
      cancelable: false,
    });
    result.host.dispatchEvent(rich);
    result.host.innerHTML = "<strong>rich mutation</strong>";
    result.host.dispatchEvent(new InputEvent("input", {
      inputType: "formatBold",
      bubbles: true,
    }));

    expect(rich.defaultPrevented).toBe(false);
    expect(result.host.textContent).toBe("Publish");
    expect(result.host.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(getInlineTextDiagnostic()).toMatchObject({ reason: "rich-input" });

    selectHost();
    const unknown = new InputEvent("beforeinput", {
      inputType: "historyUndo",
      bubbles: true,
      cancelable: false,
    });
    result.host.dispatchEvent(unknown);
    result.host.textContent = "unknown mutation";
    result.host.dispatchEvent(new InputEvent("input", {
      inputType: "historyUndo",
      bubbles: true,
    }));

    expect(unknown.defaultPrevented).toBe(false);
    expect(result.host.textContent).toBe("Publish");
    expect(getInlineTextDiagnostic()).toMatchObject({ reason: "rich-input" });
    result.cancel();
    expect(getChangesList()).toEqual([]);
  });

  it("holds Enter through composition and commits one canonical session", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    result.host.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    result.host.textContent = "公開";
    result.host.dispatchEvent(new InputEvent("input", {
      inputType: "insertCompositionText",
      bubbles: true,
    }));
    result.host.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    }));
    expect(getInlineTextSession()).toBe(result);
    result.host.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    result.host.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));

    expect(getInlineTextSession()).toBeNull();
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toMatchObject({ kind: "component-prop", after: "公開" });
  });

  it("waits one macrotask after compositionend so pending blur keeps final input", () => {
    vi.useFakeTimers();
    try {
      const element = fixture();
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      result.host.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      result.host.textContent = "公開";
      result.host.dispatchEvent(new FocusEvent("blur"));
      result.host.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      result.host.textContent = "公開中";
      result.host.dispatchEvent(new InputEvent("input", {
        inputType: "insertCompositionText",
        bubbles: true,
      }));
      vi.runAllTimers();

      expect(getChangesList()).toMatchObject([{ kind: "component-prop", after: "公開中" }]);
      expect(getInlineTextSession()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses guarded navigator clipboard fallback for a missing clipboardData paste", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const readText = vi.fn().mockResolvedValue("Clipboard text");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
    try {
      const element = fixture();
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      result.host.dispatchEvent(paste);
      await Promise.resolve();
      await Promise.resolve();

      expect(paste.defaultPrevented).toBe(true);
      expect(readText).toHaveBeenCalledTimes(1);
      expect(result.host.textContent).toBe("Clipboard text");
      result.cancel();
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("does not apply a late clipboard fallback after the session ends", async () => {
    let resolveClipboard!: (value: string) => void;
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: () => new Promise<string>((resolve) => { resolveClipboard = resolve; }) },
    });
    try {
      const element = fixture();
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      result.host.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
      result.cancel();
      resolveClipboard("late text");
      await Promise.resolve();
      await Promise.resolve();
      expect(element.textContent).toBe("Publish");
      expect(getChangesList()).toEqual([]);
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("suppresses interactive actions only while the session is active", () => {
    const element = fixture();
    const action = vi.fn();
    element.addEventListener("click", action);
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    result.host.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(action).not.toHaveBeenCalled();
    result.cancel();
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("preserves the complete pointer sequence inside the host and blocks app actions outside", () => {
    const element = fixture();
    const outside = document.createElement("button");
    outside.textContent = "outside";
    const outsideAction = vi.fn();
    const ancestorPointerAction = vi.fn();
    outside.addEventListener("click", outsideAction);
    for (const eventName of ["mousedown", "mouseup", "pointerdown", "pointerup"] as const) {
      document.body.addEventListener(eventName, ancestorPointerAction);
    }
    document.body.append(outside);
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);

    for (const event of [
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      new Event("pointerdown", { bubbles: true, cancelable: true }),
      new Event("pointerup", { bubbles: true, cancelable: true }),
    ]) {
      result.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(ancestorPointerAction).not.toHaveBeenCalled();
    const outsideDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    outside.dispatchEvent(outsideDown);
    expect(outsideDown.defaultPrevented).toBe(false);
    expect(ancestorPointerAction).not.toHaveBeenCalled();
    const outsideClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    outside.dispatchEvent(outsideClick);
    expect(outsideClick.defaultPrevented).toBe(true);
    expect(outsideAction).not.toHaveBeenCalled();
    result.cancel();
    for (const eventName of ["mousedown", "mouseup", "pointerdown", "pointerup"] as const) {
      document.body.removeEventListener(eventName, ancestorPointerAction);
    }
  });

  it("ends deterministically on reconciliation, route disposal, frame disposal, and selection removal", async () => {
    const element = fixture();
    const first = beginInlineTextEdit(element);
    if ("kind" in first) throw new Error(first.message);
    element.remove();
    await Promise.resolve();
    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "app-reconciled" });

    document.body.replaceChildren();
    const routeElement = fixture();
    const route = beginInlineTextEdit(routeElement);
    if ("kind" in route) throw new Error(route.message);
    window.dispatchEvent(new Event("popstate"));
    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "route-disposed" });

    document.body.replaceChildren();
    const frameElement = fixture();
    const frame = beginInlineTextEdit(frameElement);
    if ("kind" in frame) throw new Error(frame.message);
    window.dispatchEvent(new Event("pagehide"));
    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "frame-disposed" });

    document.body.replaceChildren();
    const selectionElement = fixture();
    const selection = beginInlineTextEdit(selectionElement);
    if ("kind" in selection) throw new Error(selection.message);
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "selection-removed" });
    expect(selectionElement.textContent).toBe("Publish");
  });

  it("scopes pushState/replaceState route disposal and restores the original methods", () => {
    const originalUrl = window.location.href;
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const pushElement = fixture();
    const push = beginInlineTextEdit(pushElement);
    if ("kind" in push) throw new Error(push.message);
    expect(window.history.pushState).not.toBe(originalPushState);
    window.history.pushState({}, "", "#inline-push");
    expect(getInlineTextSession()).toBeNull();
    expect(window.history.pushState).toBe(originalPushState);
    expect(getInlineTextDiagnostic()).toMatchObject({ reason: "route-disposed" });

    document.body.replaceChildren();
    const replaceElement = fixture();
    const replace = beginInlineTextEdit(replaceElement);
    if ("kind" in replace) throw new Error(replace.message);
    expect(window.history.replaceState).not.toBe(originalReplaceState);
    window.history.replaceState({}, "", "#inline-replace");
    expect(getInlineTextSession()).toBeNull();
    expect(window.history.replaceState).toBe(originalReplaceState);
    window.history.replaceState({}, "", originalUrl);
  });

  it("does not dispose a session owned by another Canvas document", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const foreignFrame = document.implementation.createHTMLDocument("foreign frame");

    disposeInlineTextEdit("frame-disposed", foreignFrame);
    expect(getInlineTextSession()).toBe(result);

    disposeInlineTextEdit("frame-disposed");
    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "frame-disposed" });
  });

  it("removes a wrapper moved out of its reconciled root", async () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const moved = document.createElement("aside");
    document.body.append(moved);
    element.replaceChildren(document.createTextNode("Publish"));
    moved.append(result.host);

    await Promise.resolve();

    expect(getInlineTextSession()).toBeNull();
    expect(moved.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(element.textContent).toBe("Publish");
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "app-reconciled" });
  });

  it("auto-cancels asynchronously when the host is reordered within its root", async () => {
    const element = fixture();
    const suffix = document.createTextNode("!");
    element.append(suffix);
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    element.append(result.host);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(getInlineTextSession()).toBeNull();
    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(element.textContent).toBe("!");
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "app-reconciled" });
  });

  it("cancels without reinserting when the host is reordered within its root", () => {
    const element = fixture();
    const suffix = document.createTextNode("!");
    element.append(suffix);
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    element.append(result.host);

    result.cancel();

    expect(getInlineTextSession()).toBeNull();
    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(element.textContent).toBe("!");
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "cancelled", reason: "app-reconciled" });
  });

  it("rejects a selected text node nested in an application contenteditable", () => {
    const element = document.createElement("div");
    element.dataset.cid = "EditorShell";
    element.dataset.src = "src/App.tsx:50:1";
    const appEditor = document.createElement("span");
    appEditor.setAttribute("contenteditable", "true");
    appEditor.textContent = "Application draft";
    element.append(appEditor);
    document.body.append(element);

    expect(beginInlineTextEdit(element)).toMatchObject({
      kind: "rejected",
      reason: "no-binding",
    });
  });

  it("commits the changed text when the native host blurs", () => {
    vi.useFakeTimers();
    try {
      const element = fixture();
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      result.host.textContent = "Blurred";
      result.host.dispatchEvent(new FocusEvent("blur"));
      vi.runAllTimers();

      expect(getChangesList()).toMatchObject([{
        kind: "component-prop",
        property: "label",
        before: { kind: "value", value: "Publish" },
        after: "Blurred",
      }]);
      expect(getInlineTextSession()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the prior focus on commit but preserves a chooser control focus", () => {
    const control = document.createElement("button");
    document.body.append(control);
    control.focus();
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    result.host.textContent = "Entered";
    result.commit();
    expect(document.activeElement).toBe(control);

    clearChanges();
    const second = beginInlineTextEdit(element);
    if ("kind" in second) throw new Error(second.message);
    const chooser = document.createElement("button");
    document.body.append(chooser);
    chooser.focus();
    second.cancel();
    expect(document.activeElement).toBe(chooser);
  });

  it("inherits spellcheck state without adding a temporary override", () => {
    const element = fixture();
    element.setAttribute("spellcheck", "false");
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);

    expect(result.host.hasAttribute("spellcheck")).toBe(false);
    result.cancel();

    expect(element.getAttribute("spellcheck")).toBe("false");
    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
  });

  it("clears a pending blur before it can resurrect a draft", () => {
    vi.useFakeTimers();
    try {
      const element = fixture();
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      result.host.textContent = "Pending draft";
      result.host.dispatchEvent(new FocusEvent("blur"));
      clearChanges();
      vi.runAllTimers();

      expect(getInlineTextSession()).toBeNull();
      expect(getChangesList()).toEqual([]);
      expect(element.textContent).toBe("Publish");
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the original text and creates no history entry on cancel", () => {
    const element = fixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    const host = result.host;
    host.textContent = "Draft";
    result.cancel();

    expect(element.textContent).toBe("Publish");
    expect(element.querySelector('[data-inline-editor="true"]')).toBeNull();
    expect(getChangesList()).toEqual([]);
  });

  it("falls back to a durable rendered-text binding when no semantic contract matches", () => {
    componentContracts.length = 0;
    const element = renderedFixture();
    const result = beginInlineTextEdit(element);
    if ("kind" in result) throw new Error(result.message);
    expect(result.binding).toMatchObject({
      kind: "rendered-text",
      target: {
        sourceSite: { cid: "Copy", src: "src/Copy.tsx:8:3" },
        beforeText: "Original copy",
      },
    });

    result.host.textContent = "Updated copy";
    const change = result.commit();
    expect(change).toMatchObject({
      kind: "text-content",
      before: "Original copy",
      after: "Updated copy",
      source: { file: "src/Copy.tsx", line: 8, column: 3 },
    });
    expect(element.textContent).toBe("Updated copy");
    expect(element.getAttribute(TEXT_PROJECTION_ATTR)).toBe(change && "id" in change ? change.id : null);
    expect(getTextProjectionReports(document)).toMatchObject([{ status: "applied" }]);
    expect(document.getElementById("nudge-ui-styles")?.textContent ?? "").not.toContain("Updated copy");
  });

  it("re-enters an empty rendered projection and merges into one canonical record", () => {
    componentContracts.length = 0;
    const element = renderedFixture();
    const first = beginInlineTextEdit(element);
    if ("kind" in first) throw new Error(first.message);
    first.host.textContent = "";
    const emptied = first.commit();
    expect(emptied).toMatchObject({ kind: "text-content", before: "Original copy", after: "" });
    expect(element.textContent).toBe("");

    const marker = element.querySelector("[data-empty-text]");
    expect(marker).toBeInstanceOf(HTMLElement);
    if (!(marker instanceof HTMLElement)) throw new Error("empty projection affordance missing");
    const second = beginInlineTextEditFromEmptyProjection(marker);
    if ("kind" in second) throw new Error(second.message);
    expect(second.before).toBe("");
    expect(second.binding).toMatchObject({ kind: "rendered-text" });
    second.host.textContent = "Restored copy";
    const restored = second.commit();

    expect(restored).toMatchObject({ kind: "text-content", before: "", after: "Restored copy" });
    expect(element.textContent).toBe("Restored copy");
    expect(element.querySelector("[data-empty-text]")).toBeNull();
    expect(getChangesList()).toHaveLength(1);
    expect(getChangesList()[0]).toMatchObject({
      kind: "text-content",
      before: "Original copy",
      after: "Restored copy",
    });
  });

  it("requires an explicit source-site scope before broadening a repeated literal", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Label";
    element.dataset.src = "src/App.tsx:12:5";
    element.textContent = "Repeated literal";
    const other = document.createElement("span");
    other.dataset.cid = "Label";
    other.dataset.src = "src/App.tsx:12:5";
    other.textContent = "Other literal";
    document.body.append(element, other);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: (root) => [{
        framework: "react",
        meta: {
          callsiteId: "src/App.tsx:12:5",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "src/App.tsx",
          line: 12,
          column: 5,
          authoredProps: { text: "literal" },
        },
        props: { text: root.textContent ?? "" },
      }],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      expect(result.scopeChoices).toEqual(["rendered-instance", "source-site"]);
      expect(result.scope).toBe("rendered-instance");
      result.chooseScope("source-site");
      result.host.textContent = "All outputs";
      const change = result.commit();
      expect(change).toMatchObject({
        kind: "component-prop",
        property: "text",
        scope: "source-site",
        evidence: { mountedCount: 2, beforeText: "Repeated literal" },
      });
      expect(serializeSession().changes).toMatchObject([{
        kind: "component-prop",
        scope: "source-site",
        evidence: { mountedCount: 2 },
      }]);
    } finally {
      unregister();
    }
  });

  it("rejects an item-only commit when repeated literal evidence is identical", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const first = document.createElement("span");
    first.dataset.cid = "Label";
    first.dataset.src = "src/App.tsx:12:5";
    first.textContent = "Identical";
    const second = first.cloneNode(true) as HTMLElement;
    document.body.append(first, second);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => [{
        framework: "react",
        meta: {
          callsiteId: "src/App.tsx:12:5",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "src/App.tsx",
          line: 12,
          column: 5,
          authoredProps: { text: "literal" },
        },
        props: { text: "Identical" },
      }],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      const result = beginInlineTextEdit(first);
      if ("kind" in result) throw new Error(result.message);
      result.host.textContent = "Edited item";
      expect(result.commit()).toBeNull();
      expect(getChangesList()).toEqual([]);
    } finally {
      unregister();
    }
  });

  it("keeps chooser metadata and commits the selected repeated semantic prop as one text instance", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "custom/Choice#Choice",
      name: "Choice",
      file: "custom/Choice.tsx",
      provenance: "package-manifest",
      props: [
        { name: "first", control: "text", options: [], optional: false },
        { name: "second", control: "text", options: [], optional: false },
      ],
    });
    const first = document.createElement("span");
    first.dataset.cid = "Choice";
    first.dataset.src = "src/App.tsx:20:5";
    first.textContent = "Choice A";
    const second = document.createElement("span");
    second.dataset.cid = "Choice";
    second.dataset.src = "src/App.tsx:20:5";
    second.textContent = "Choice B";
    document.body.append(first, second);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: (element) => {
        const value = element.textContent ?? "";
        return [{
          framework: "react",
          meta: {
            callsiteId: "src/App.tsx:20:5",
            componentId: "custom/Choice#Choice",
            componentName: "Choice",
            file: "src/App.tsx",
            line: 20,
            column: 5,
            authoredProps: { first: "literal", second: "literal" },
          },
          props: { first: value, second: value },
        }];
      },
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      const result = beginInlineTextEdit(first);
      if ("kind" in result) throw new Error(result.message);
      expect(result.bindingChoices.map((choice) => choice.binding.property)).toEqual(["first", "second"]);
      expect(result.bindingChoices.every((choice) => choice.renderedTarget !== null)).toBe(true);
      result.chooseBinding(1);
      expect(result.binding).toMatchObject({ kind: "component-prop", property: "second" });
      result.chooseScope("rendered-instance");
      result.host.textContent = "Second choice edited";

      const change = result.commit();
      expect(change).toMatchObject({
        kind: "text-content",
        scope: "rendered-instance",
        before: "Choice A",
        after: "Second choice edited",
        evidence: { property: "second", mountedCount: 2 },
        target: { sourceSite: { cid: "Choice", src: "src/App.tsx:20:5" } },
      });
      expect(first.textContent).toBe("Second choice edited");
      expect(second.textContent).toBe("Choice B");
    } finally {
      unregister();
    }
  });

  it("does not inherit the first candidate scope choices after choosing another binding", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "custom/Outer#Outer",
      name: "Outer",
      file: "custom/Outer.tsx",
      provenance: "package-manifest",
      props: [{ name: "children", control: "text", options: [], optional: false }],
    });
    componentContracts.push({
      componentId: "custom/Inner#Inner",
      name: "Inner",
      file: "custom/Inner.tsx",
      provenance: "package-manifest",
      props: [{ name: "children", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Outer";
    element.dataset.src = "src/App.tsx:10:5";
    element.textContent = "Same";
    document.body.append(element);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: () => [
        {
          framework: "react",
          meta: {
            callsiteId: "outer",
            componentId: "custom/Outer#Outer",
            componentName: "Outer",
            file: "src/App.tsx",
            line: 10,
            column: 5,
            authoredProps: { children: "literal" },
          },
          props: { children: "Same" },
        },
        {
          framework: "react",
          meta: {
            callsiteId: "inner",
            componentId: "custom/Inner#Inner",
            componentName: "Inner",
            file: "src/Inner.tsx",
            line: 2,
            column: 1,
            authoredProps: { children: "expression" },
          },
          props: { children: "Same" },
        },
      ],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: (callsiteId) => callsiteId === "outer" ? 2 : 1,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      expect(result.bindingChoices).toHaveLength(2);
      expect(result.scopeChoices).toEqual(["rendered-instance", "source-site"]);

      result.chooseBinding(1);
      expect(result.binding).toMatchObject({ kind: "component-prop", property: "children" });
      expect(result.scopeChoices).toEqual([]);
      expect(result.scope).toBe("source-site");

      result.chooseScope("rendered-instance");
      expect(result.scope).toBe("source-site");
      result.cancel();
    } finally {
      unregister();
    }
  });

  it("offers source-site scope when a repeated literal cannot use rendered fallback", () => {
    componentContracts.length = 0;
    componentContracts.push({
      componentId: "custom/Label#Label",
      name: "Label",
      file: "custom/Label.tsx",
      provenance: "package-manifest",
      props: [{ name: "text", control: "text", options: [], optional: false }],
    });
    const element = document.createElement("span");
    element.dataset.cid = "Label";
    element.dataset.src = "src/App.tsx:12:5";
    element.innerHTML = "<strong>Repeated literal</strong>";
    const other = document.createElement("span");
    other.dataset.cid = "Label";
    other.dataset.src = "src/App.tsx:12:5";
    other.textContent = "Other literal";
    document.body.append(element, other);
    const adapter: ComponentRuntimeAdapter = {
      framework: "react",
      inspect: (root) => [{
        framework: "react",
        meta: {
          callsiteId: "src/App.tsx:12:5",
          componentId: "custom/Label#Label",
          componentName: "Label",
          file: "src/App.tsx",
          line: 12,
          column: 5,
          authoredProps: { text: "literal" },
        },
        props: { text: root.textContent ?? "" },
      }],
      replaceOverrides: () => undefined,
      getCallsiteMultiplicity: () => 2,
    };
    const unregister = registerComponentRuntimeAdapter(adapter);
    try {
      const result = beginInlineTextEdit(element);
      if ("kind" in result) throw new Error(result.message);
      expect(result.binding).toMatchObject({ kind: "component-prop", property: "text" });
      expect(result.scope).toBe("source-site");
      expect(result.scopeChoices).toEqual(["source-site"]);

      result.host.textContent = "All literal outputs";
      const change = result.commit();
      expect(change).toMatchObject({
        kind: "component-prop",
        property: "text",
        after: "All literal outputs",
        scope: "source-site",
        evidence: { mountedCount: 2, beforeText: "Repeated literal" },
      });
    } finally {
      unregister();
    }
  });

  it("does not begin an inline session in production mode", () => {
    vi.stubEnv("DEV", false);
    try {
      const result = beginInlineTextEdit(renderedFixture());
      expect(result).toMatchObject({ kind: "rejected", reason: "no-binding" });
      expect(getInlineTextSession()).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
