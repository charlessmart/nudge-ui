// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelectedElement } from "../selectionStore.ts";
import type { InteractionState } from "../styleState.ts";
import type {
  BrowserCssInspection,
  InspectionSnapshot,
} from "./browserCssInspection.ts";
import { useBrowserCssInspection } from "./useBrowserCssInspection.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function snapshot(state: InteractionState, cascade: InspectionSnapshot["cascade"]): InspectionSnapshot {
  return {
    target: { status: "attached" },
    cascade,
    requestedState: state,
    authoredState: cascade === "authored" ? state : "base",
    paintedState: "current",
    properties: [],
    availableTokens: [],
    availableStates: ["base"],
    revision: { element: 0, stylesheet: 0, tokenGeneration: "test" },
    diagnostics: [],
  };
}

describe("useBrowserCssInspection", () => {
  it("owns one session subscription while selection state changes", () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const inspect = vi.fn<BrowserCssInspection["inspect"]>(
      (_element, options = {}) => snapshot(options.state ?? "base", options.cascade ?? "authored"),
    );
    const session: BrowserCssInspection = {
      inspect,
      inspectTokens: () => ({
        inventory: [],
        tokens: [],
        revision: { element: 0, stylesheet: 0, tokenGeneration: "test" },
        diagnostics: [],
      }),
      subscribe,
      notifyStylesheetChange() {},
      dispose() {},
    };
    const element = document.createElement("div");
    document.body.appendChild(element);
    const selected: SelectedElement = {
      cid: "Card",
      src: "src/Card.tsx:1:1",
      cprops: null,
      file: "src/Card.tsx",
      line: 1,
      column: 1,
      domElement: element,
      componentTargets: [],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function Probe({ state }: { state: InteractionState }) {
      useBrowserCssInspection(selected, state, { session });
      return null;
    }

    act(() => root.render(<Probe state="base" />));
    act(() => root.render(<Probe state="hover" />));

    expect(subscribe).toHaveBeenCalledTimes(1);
    // Each state reads authored and stable cascades once. A fresh normalized
    // selection array would make this count grow through a render loop.
    expect(inspect).toHaveBeenCalledTimes(4);

    act(() => root.unmount());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
