// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  createElement,
  forwardRef,
  memo,
  useState,
  type ReactNode,
} from "react";
import type { Root } from "react-dom/client";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "./reactRendererCapture.ts";
import {
  inspectReactComponentTargets,
  inspectReactRootInvocations,
  registerReactCallsites,
  replaceReactComponentOverrides,
  resetReactComponentRuntime,
} from "./reactRuntime.tsx";
import type { ComponentInvocationMeta } from "./types.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let createRoot: typeof import("react-dom/client").createRoot;

beforeAll(async () => {
  // The capture script runs before the renderer loads, as it does in the page head.
  new Function(REACT_RENDERER_CAPTURE_SCRIPT)();
  ({ createRoot } = await import("react-dom/client"));
});

function meta(callsiteId: string, componentName: string, componentId = `src/ui#${componentName}`): ComponentInvocationMeta {
  const [file, line, column] = callsiteId.split(":");
  return {
    callsiteId,
    componentId,
    componentName,
    file: file!,
    line: Number(line),
    column: Number(column),
    authoredProps: { tone: "literal" },
  };
}

const BOX = meta("src/App.tsx:4:3", "Box", "@fixture/ds#Box");
const BADGE = meta("src/App.tsx:5:5", "Badge");

/** Identity tags arrive as ordinary props, exactly as the compiler emits them. */
type Tagged<P> = P & { [tag: `data-${string}`]: string };

/** A package layout primitive: memo + forwardRef layers, props spread into an inner component. */
const BoxImpl = (props: { children?: ReactNode }) => createElement("section", null, props.children);
const Box = memo(forwardRef<HTMLElement, Tagged<{ children?: ReactNode }>>(function Box(props, _ref) {
  return createElement(BoxImpl, props);
}));

function Badge({ tone }: Tagged<{ tone: string }>) {
  return createElement("span", { "data-tone": tone }, tone);
}

/** Authored JSX after the compiler: identity tags on every component callsite. */
function badge(tone: string, key?: string) {
  return createElement(Badge, { key, tone, "data-cid": "Badge", "data-src": BADGE.callsiteId });
}

function boxed(children: ReactNode) {
  return createElement(Box, { "data-cid": "Box", "data-src": BOX.callsiteId }, children);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("tagged React callsites", () => {
  let root: Root | null = null;
  let host: HTMLElement;

  beforeEach(() => {
    resetReactComponentRuntime();
    registerReactCallsites([BOX, BADGE]);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    replaceReactComponentOverrides([]);
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    resetReactComponentRuntime();
  });

  it("names unwrapped components nearest first, merging layers of one invocation", () => {
    act(() => root?.render(boxed(badge("info"))));
    const span = host.querySelector("span") as HTMLElement;

    const targets = inspectReactComponentTargets(span);

    expect(targets.map((target) => target.meta.componentName)).toEqual(["Badge", "Box"]);
    expect(targets[0]).toMatchObject({
      framework: "react",
      meta: BADGE,
      props: { tone: "info" },
      mountedCount: 1,
      livePreview: true,
    });
    expect(targets[0]!.props).not.toHaveProperty("data-src");
    expect(targets[1]!.meta.componentId).toBe("@fixture/ds#Box");
  });

  it("counts every mounted invocation of a callsite", () => {
    act(() => root?.render(boxed([badge("a", "a"), badge("b", "b"), badge("c", "c")])));
    const target = inspectReactComponentTargets(host.querySelector("span") as HTMLElement)[0];
    expect(target?.mountedCount).toBe(3);
  });

  it("reports root invocations for an element that is a component's whole output", () => {
    act(() => root?.render(boxed(badge("info"))));
    expect(inspectReactRootInvocations(host.querySelector("span") as HTMLElement))
      .toEqual([{ callsiteId: BADGE.callsiteId, componentName: "Badge" }]);
    expect(inspectReactRootInvocations(host.querySelector("section") as HTMLElement))
      .toEqual([{ callsiteId: BOX.callsiteId, componentName: "Box" }]);
  });

  it("previews a prop live, keeps it across parent renders, and restores the authored value", async () => {
    let setTone: (tone: string) => void = () => undefined;
    function App() {
      const [tone, update] = useState("info");
      setTone = update;
      return boxed([badge(tone, "a"), badge(tone, "b")]);
    }
    act(() => root?.render(createElement(App)));
    inspectReactComponentTargets(host.querySelector("span") as HTMLElement);
    const tones = () => [...host.querySelectorAll("span")].map((span) => span.textContent);

    act(() => replaceReactComponentOverrides([
      { framework: "react", callsiteId: BADGE.callsiteId, prop: "tone", value: "critical" },
    ]));
    await flush();
    expect(tones()).toEqual(["critical", "critical"]);

    act(() => setTone("success"));
    await flush();
    expect(tones()).toEqual(["critical", "critical"]);

    act(() => replaceReactComponentOverrides([]));
    await flush();
    expect(tones()).toEqual(["success", "success"]);
  });

  it("ignores identity tags the compiler did not register", () => {
    act(() => root?.render(createElement(Badge, { tone: "info", "data-src": "src/Other.tsx:1:1" })));
    expect(inspectReactComponentTargets(host.querySelector("span") as HTMLElement)).toEqual([]);
  });
});
