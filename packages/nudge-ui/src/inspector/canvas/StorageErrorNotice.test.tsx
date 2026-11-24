// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { StorageErrorNotice } from "./StorageErrorNotice.tsx";
import { hasWriteLease, releaseLease } from "./workspaceLease.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  releaseLease();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  releaseLease();
  localStorage.clear();
});

it("reclaims ownership before retrying and disables a duplicate retry", async () => {
  let finishRetry!: () => void;
  const retry = new Promise<void>((resolve) => { finishRetry = resolve; });
  let retries = 0;
  act(() => root.render(<StorageErrorNotice onRetry={() => {
    expect(hasWriteLease()).toBe(true);
    retries += 1;
    return retry;
  }} />));
  const button = host.querySelector<HTMLButtonElement>('[data-test="storage-error-retry"]')!;
  expect(host.textContent).toContain("Can’t load saved changes");

  act(() => button.click());
  expect(button.disabled).toBe(true);
  act(() => button.click());
  expect(retries).toBe(1);

  await act(async () => finishRetry());
  expect(button.disabled).toBe(false);
});
