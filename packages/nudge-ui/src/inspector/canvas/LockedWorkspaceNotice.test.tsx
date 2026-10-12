// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LockedWorkspaceNotice } from "./LockedWorkspaceNotice.tsx";
import { hasWriteLease, releaseLease } from "./workspaceLease.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
  releaseLease();
  const projectId = getNudgeUiRuntimeConfig().projectId;
  localStorage.setItem(`nudge-ui:${projectId}:lease`, JSON.stringify({
    ownerId: "other-tab", projectId, acquiredAt: Date.now(), lastHeartbeat: Date.now(),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  releaseLease();
  localStorage.clear();
  vi.useRealTimers();
});

it("acquires ownership before loading saved state and disables duplicate takeover", async () => {
  let finishStart!: () => void;
  const startup = new Promise<void>((resolve) => { finishStart = resolve; });
  let starts = 0;
  act(() => root.render(<LockedWorkspaceNotice onTakeover={() => {
    expect(hasWriteLease()).toBe(true);
    starts += 1;
    return startup;
  }} />));
  const button = host.querySelector<HTMLButtonElement>('[data-test="takeover-here"]')!;

  act(() => button.click());
  expect(button.disabled).toBe(true);
  expect(hasWriteLease()).toBe(true);
  act(() => button.click());
  expect(starts).toBe(1);

  await act(async () => finishStart());
  expect(button.disabled).toBe(false);
});

it("offers retry when controller hydration reports a storage error", async () => {
  let takenOver = false;
  act(() => root.render(<LockedWorkspaceNotice storageError onTakeover={() => { takenOver = true; }} />));
  const button = host.querySelector<HTMLButtonElement>('[data-test="takeover-here"]')!;

  await act(async () => button.click());
  expect(host.textContent).toContain("Can’t load saved changes. Try again.");
  expect(button.disabled).toBe(false);
  expect(takenOver).toBe(true);
});
