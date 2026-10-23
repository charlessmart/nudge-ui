import type { FrameContent } from "./frameContent.ts";

/** Cross-store effects a frame removal needs: whether drafts allow editing, and who releases the frame's draft and HTML artifact. Canvas registers nothing itself, so it never imports drafts or the iteration client. */
export interface FrameLifecycle {
  readonly canEdit: () => boolean;
  readonly release: (released: FrameContent, remaining: readonly FrameContent[]) => void;
}

const allowAll: FrameLifecycle = {
  canEdit: () => true,
  release: () => undefined,
};

let lifecycle: FrameLifecycle = allowAll;

export function setFrameLifecycle(next: FrameLifecycle | null): void {
  lifecycle = next ?? allowAll;
}

export function frameLifecycle(): FrameLifecycle {
  return lifecycle;
}
