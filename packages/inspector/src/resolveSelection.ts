import type { SelectedElement } from "./selectionStore.ts";
import { inspectComponentTargets } from "./componentSemantics/index.ts";
import { resolveSelectionTarget, selectionTargetMode, type SelectionTargetMode } from "./selectionTarget.ts";

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
      return Reflect.get(el, key);
    }
  }
  return undefined;
}

export function resolveSelectionFromElement(el: HTMLElement): SelectedElement | null {
  const componentTargets = inspectComponentTargets(el);
  const nearestComponent = componentTargets[0];
  const cid = el.getAttribute("data-cid") ?? nearestComponent?.meta.componentName ?? null;
  if (!cid) return null;
  const src = el.getAttribute("data-src") ?? nearestComponent?.meta.callsiteId ?? "";
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
    componentTargets,
  };
}

export function resolveSelectionFromEvent(
  e: MouseEvent,
  inspectorHost: Element,
  mode: SelectionTargetMode = selectionTargetMode(e),
): SelectedElement | null {
  const target = e.target;
  if (!(target instanceof Element)) return null;
  if (inspectorHost === target || inspectorHost.contains(target)) return null;
  const root = target.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement && root.host.id === "nudge-ui-root") {
    return null;
  }
  const el = resolveSelectionTarget(target, mode);
  return el ? resolveSelectionFromElement(el) : null;
}
