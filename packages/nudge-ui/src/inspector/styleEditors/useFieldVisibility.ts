import { useState } from "react";
import { getActiveStyleState } from "../shell/styleState.ts";

/** Keeps an opened field mounted when an edit reaches zero, none, or transparent. */
export function useFieldVisibility(
  elements: readonly HTMLElement[],
  property: string,
  present: boolean,
): { visible: boolean; show(): void; hide(): void } {
  const styleState = getActiveStyleState();
  const [previous, setPrevious] = useState({ elements, property, styleState, present, visible: present });
  const selectionChanged = property !== previous.property
    || styleState !== previous.styleState
    || elements.length !== previous.elements.length
    || elements.some((element, index) => element !== previous.elements[index]);
  let current = previous;
  if (selectionChanged || present !== previous.present) {
    current = {
      elements, property, styleState, present,
      visible: selectionChanged ? present : previous.visible || present,
    };
    // Adjust before rendering children so a selection change cannot briefly
    // mount the previous selection's controls or interrupt an active drag.
    setPrevious(current);
  }
  return {
    visible: current.visible,
    show: () => setPrevious({ ...current, visible: true }),
    hide: () => setPrevious({ ...current, visible: false }),
  };
}
