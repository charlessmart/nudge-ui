import { useSyncExternalStore } from "react";
import type { DropLocation } from "./domMutations.ts";

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

/** Publishes one guide model from a DOM insertion location. */
export function showDropGuide(owner: DropGuideOwner, document: Document, drop: DropLocation): void {
  const target = drop.parent.getBoundingClientRect();
  const nextGuide: DropGuide = {
    owner,
    document,
    orientation: drop.orientation,
    line: { left: drop.left, top: drop.top, width: drop.width, height: drop.height },
    target: { left: target.left, top: target.top, width: target.width, height: target.height },
  };
  if (currentGuide?.owner === owner
    && currentGuide.document === document
    && sameRect(currentGuide.line, nextGuide.line)
    && sameRect(currentGuide.target, nextGuide.target)) return;
  currentGuide = nextGuide;
  notify();
}

/** Clears only the guide belonging to the caller, preserving another active view. */
export function clearDropGuide(owner: DropGuideOwner): void {
  if (currentGuide?.owner !== owner) return;
  currentGuide = null;
  notify();
}

/** Subscribes a visual adapter to its guide without exposing shared mutable state. */
export function useDropGuide(owner: DropGuideOwner): DropGuide | null {
  return useSyncExternalStore(subscribe, () => snapshotFor(owner), () => null);
}
