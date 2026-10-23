import { useSyncExternalStore } from "react";
import { dropTargetRect, type DropLocation } from "./structuralGestures.ts";
import { hostComponentName } from "../componentSemantics/react/fibers.ts";

export type DropGuideOwner = "inspect" | "canvas";

export interface DropGuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A document-local guide. Visual adapters are responsible for projecting it. */
export interface DropGuide {
  owner: DropGuideOwner;
  document: Document;
  orientation: DropLocation["orientation"];
  line: DropGuideRect;
  target: DropGuideRect;
  /** Names the container the drop lands in, so a drop at an unexpected level is visible before release. */
  label: string;
}

/** The component that renders the drop parent when React can name it, otherwise its tag. */
export function dropTargetLabel(parent: HTMLElement): string {
  return `Into ${hostComponentName(parent) ?? parent.localName}`;
}

let currentGuide: DropGuide | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshotFor(owner: DropGuideOwner): DropGuide | null {
  return currentGuide?.owner === owner ? currentGuide : null;
}

function sameRect(left: DropGuideRect, right: DropGuideRect): boolean {
  return left.left === right.left
    && left.top === right.top
    && left.width === right.width
    && left.height === right.height;
}

export function showDropGuide(owner: DropGuideOwner, document: Document, drop: DropLocation): void {
  const target = dropTargetRect(drop.parent);
  const nextGuide: DropGuide = {
    owner,
    document,
    orientation: drop.orientation,
    line: { left: drop.left, top: drop.top, width: drop.width, height: drop.height },
    target: { left: target.left, top: target.top, width: target.width, height: target.height },
    label: dropTargetLabel(drop.parent),
  };
  if (currentGuide?.owner === owner
    && currentGuide.document === document
    && sameRect(currentGuide.line, nextGuide.line)
    && sameRect(currentGuide.target, nextGuide.target)
    && currentGuide.label === nextGuide.label) return;
  currentGuide = nextGuide;
  notify();
}

export function clearDropGuide(owner: DropGuideOwner): void {
  if (currentGuide?.owner !== owner) return;
  currentGuide = null;
  notify();
}

export function useDropGuide(owner: DropGuideOwner): DropGuide | null {
  return useSyncExternalStore(subscribe, () => snapshotFor(owner), () => null);
}
