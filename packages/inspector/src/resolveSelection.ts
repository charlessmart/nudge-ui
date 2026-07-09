import type { SelectedElement } from "./selectionStore.ts";

const REACT_FIBER_KEY = /^__reactFiber\$/;
const REACT_INTERNAL_KEY = /^__reactInternalInstance\$/;
const SRC_PATTERN = /^(.*):(\d+):(\d+)$/;

export interface ParsedSrc {
  file: string;
  line: number;
  column: number;
}

export function parseDataSrc(src: string): ParsedSrc | null {
  const match = SRC_PATTERN.exec(src);
  if (!match) return null;
  const file = match[1];
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (file === undefined || Number.isNaN(line) || Number.isNaN(column)) return null;
  return { file, line, column };
}

function findReactFiber(el: HTMLElement): unknown {
  const keys = Object.keys(el);
  for (const key of keys) {
    if (REACT_FIBER_KEY.test(key) || REACT_INTERNAL_KEY.test(key)) {
      return (el as unknown as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

export function resolveSelectionFromElement(el: HTMLElement): SelectedElement | null {
  const cid = el.getAttribute("data-cid");
  if (!cid) return null;
  const src = el.getAttribute("data-src") ?? "";
  const parsed = parseDataSrc(src);
  const cpropsAttr = el.getAttribute("data-cprops");
  const fiber = findReactFiber(el);
  return {
    cid,
    src,
    cprops: cpropsAttr,
    file: parsed?.file ?? src,
    line: parsed?.line ?? 0,
    column: parsed?.column ?? 0,
    domElement: el,
    fiber,
  };
}

export function resolveSelectionFromEvent(
  e: MouseEvent,
  inspectorHost: Element,
): SelectedElement | null {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return null;
  if (inspectorHost === target || inspectorHost.contains(target)) return null;
  const root = target.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement && root.host.id === "design-tool-root") {
    return null;
  }
  const el = target.closest("[data-cid]");
  if (!el || !(el instanceof HTMLElement)) return null;
  return resolveSelectionFromElement(el);
}