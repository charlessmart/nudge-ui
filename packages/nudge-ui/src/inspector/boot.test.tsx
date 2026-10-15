// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bootstrapNudgeUi, unmountInspector, type InspectorShell } from "./boot.ts";
import { hasWriteLease, releaseLease } from "./canvas/workspaceLease.ts";
import { getComments, saveComment, type ElementComment } from "./comments/store.ts";
import { captureRenderedInstance } from "./projection/renderedInstance.ts";
import { configureInspectorStorage, createMirroredStorage } from "./runtime/inspectorStorage.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "./runtime/runtimeConfig.ts";
import { setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";

// Render only the mounted-state signal; persistence and ownership use real stores.
const TestShell: InspectorShell = () => <div data-test="inspector-ready" />;

function bootstrap(host: HTMLElement): void {
  bootstrapNudgeUi(host, TestShell);
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialConfig = getNudgeUiRuntimeConfig();
const projectId = "boot-storage";
const commentsKey = `nudge-ui:${projectId}:comments:v1`;
const leaseKey = `nudge-ui:${projectId}:lease`;
let host: HTMLDivElement;

beforeEach(() => {
  releaseLease();
  localStorage.clear();
  configureNudgeUiRuntime({ ...initialConfig, projectId, capabilities: { ...initialConfig.capabilities, canvas: false } });
  setNudgeUiHostDevFlag(true);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => unmountInspector());
  host.remove();
  releaseLease();
  configureInspectorStorage(null);
  localStorage.clear();
  setNudgeUiHostDevFlag(false);
  configureNudgeUiRuntime(initialConfig);
});

function otherOwner(): void {
  localStorage.setItem(leaseKey, JSON.stringify({
    ownerId: "other-tab", projectId, acquiredAt: Date.now(), lastHeartbeat: Date.now(),
  }));
}

function comment(id: string): ElementComment {
  const heading = document.createElement("h1");
  heading.dataset.cid = "Heading";
  heading.dataset.src = "src/Heading.tsx:1:1";
  heading.textContent = "Heading";
  document.body.append(heading);
  const target = captureRenderedInstance(heading)!;
  heading.remove();
  return { id, route: window.location.href, target, tag: "h1", note: id, baseline: "baseline", viewport: "800:600", handedOff: false };
}

it("refreshes under ownership on initial mount and remount before saving comments", async () => {
  const backend = new Map([[commentsKey, "[]"]]);
  configureInspectorStorage(createMirroredStorage(Object.fromEntries(backend), (key, value) => {
    if (value === null) backend.delete(key);
    else backend.set(key, value);
  }, async () => {
    expect(hasWriteLease()).toBe(true);
    return Object.fromEntries(backend);
  }));
  const initial = comment("saved-before-injection");
  backend.set(commentsKey, JSON.stringify([initial]));

  await act(async () => bootstrap(host));
  expect(getComments()).toEqual([initial]);
  act(() => unmountInspector());
  releaseLease();
  const other = comment("saved-by-another-owner");
  backend.set(commentsKey, JSON.stringify([initial, other]));

  await act(async () => bootstrap(host));
  const next = comment("saved-after-remount");
  saveComment(next);

  expect(getComments()).toEqual([initial, other, next]);
  expect(JSON.parse(backend.get(commentsKey)!)).toEqual([initial, other, next]);
});

it("holds ownership during takeover refresh and waits to mount until it finishes", async () => {
  let finishRead!: (snapshot: Record<string, string>) => void;
  const read = new Promise<Record<string, string>>((resolve) => { finishRead = resolve; });
  const saved = comment("other-owner-note");
  configureInspectorStorage(createMirroredStorage({}, () => undefined, () => {
    expect(hasWriteLease()).toBe(true);
    return read;
  }));
  otherOwner();
  await act(async () => bootstrap(host));
  const takeover = host.shadowRoot!.querySelector<HTMLButtonElement>('[data-test="takeover-here"]')!;

  act(() => takeover.click());
  expect(hasWriteLease()).toBe(true);
  expect(host.shadowRoot!.querySelector('[data-test="inspector-ready"]')).toBeNull();
  await act(async () => finishRead({ [commentsKey]: JSON.stringify([saved]) }));

  expect(getComments()).toEqual([saved]);
  expect(host.shadowRoot!.querySelector('[data-test="inspector-ready"]')).not.toBeNull();
});

it("does not hydrate after another tab takes ownership during refresh", async () => {
  let finishRead!: (snapshot: Record<string, string>) => void;
  const read = new Promise<Record<string, string>>((resolve) => { finishRead = resolve; });
  configureInspectorStorage(createMirroredStorage({}, () => undefined, () => read));
  act(() => bootstrap(host));
  otherOwner();

  await act(async () => finishRead({}));

  expect(hasWriteLease()).toBe(false);
  expect(host.shadowRoot!.querySelector('[data-test="inspector-ready"]')).toBeNull();
  expect(host.shadowRoot!.querySelector('[data-test="takeover-here"]')).not.toBeNull();
});

it("does not mount after being closed while storage is loading", async () => {
  let finishRead!: (snapshot: Record<string, string>) => void;
  const read = new Promise<Record<string, string>>((resolve) => { finishRead = resolve; });
  configureInspectorStorage(createMirroredStorage({}, () => undefined, () => read));
  act(() => bootstrap(host));
  act(() => unmountInspector());

  await act(async () => finishRead({}));

  expect(host.shadowRoot?.querySelector('[data-test="inspector-ready"]')).toBeFalsy();
});

it("releases ownership and offers retry without mounting after a storage failure", async () => {
  let unavailable = true;
  configureInspectorStorage(createMirroredStorage({}, () => undefined, async () => {
    if (unavailable) throw new Error("Storage unavailable");
    return {};
  }));

  await act(async () => bootstrap(host));

  expect(hasWriteLease()).toBe(false);
  expect(host.shadowRoot!.textContent).toContain("Can’t load saved changes. Try again.");
  expect(host.shadowRoot!.querySelector('[data-test="inspector-ready"]')).toBeNull();
  unavailable = false;
  await act(async () => host.shadowRoot!.querySelector<HTMLButtonElement>('[data-test="takeover-here"]')!.click());

  expect(hasWriteLease()).toBe(true);
  expect(host.shadowRoot!.querySelector('[data-test="inspector-ready"]')).not.toBeNull();
});
