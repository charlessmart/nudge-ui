import { useEffect, useState, useSyncExternalStore } from "react";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import {
  getCanvasProjectionAcknowledgementVersion,
  subscribeCanvasProjectionAcknowledgements,
} from "../canvas/projection.ts";

export interface LayoutContext {
  /** Changes whenever an edit or a canvas projection may have changed computed layout. */
  revision: number;
  notifyAfterEdit: () => void;
  isFlexContainer: boolean;
  isGridContainer: boolean;
  isFlexChild: boolean;
  isGridChild: boolean;
  position: string;
}

const FLEX_DISPLAYS = ["flex", "inline-flex"];
const GRID_DISPLAYS = ["grid", "inline-grid"];

/** What the element is, and what its parent is, for the sections that show layout controls. */
export function useLayoutContext(
  el: HTMLElement,
  selection: StyleSelection | null | undefined,
): LayoutContext {
  const [primaryIsFlexContainer, setPrimaryIsFlexContainer] = useState(false);
  const [primaryIsFlexChild, setPrimaryIsFlexChild] = useState(false);
  const [primaryIsGridContainer, setPrimaryIsGridContainer] = useState(false);
  const [primaryIsGridChild, setPrimaryIsGridChild] = useState(false);
  const [primaryPosition, setPrimaryPosition] = useState(() => getStateStyleValue(el, "position", "static"));
  const [layoutRevision, setLayoutRevision] = useState(0);
  const projectionAcknowledgementVersion = useSyncExternalStore(
    subscribeCanvasProjectionAcknowledgements,
    getCanvasProjectionAcknowledgementVersion,
    getCanvasProjectionAcknowledgementVersion,
  );
  const revision = layoutRevision + projectionAcknowledgementVersion;

  useEffect(() => {
    try {
      const computed = getElementComputedStyle(el);
      setPrimaryIsFlexContainer(FLEX_DISPLAYS.includes(computed.display));
      setPrimaryIsGridContainer(GRID_DISPLAYS.includes(computed.display));
      setPrimaryPosition(computed.position);
    } catch {
      // The element can detach between renders.
    }
  }, [el, revision]);

  useEffect(() => {
    try {
      const parent = el.parentElement;
      const parentDisplay = parent ? getElementComputedStyle(parent).display : "";
      setPrimaryIsFlexChild(FLEX_DISPLAYS.includes(parentDisplay));
      setPrimaryIsGridChild(GRID_DISPLAYS.includes(parentDisplay));
    } catch {
      setPrimaryIsFlexChild(false);
      setPrimaryIsGridChild(false);
    }
  }, [el, revision]);

  const selectedPosition = selection?.getProperty("position")?.value;
  return {
    revision,
    notifyAfterEdit(): void {
      setLayoutRevision((value) => value + 1);
    },
    isFlexContainer: selection ? selection.supportsRole("flex-container") : primaryIsFlexContainer,
    isGridContainer: selection ? selection.supportsRole("grid-container") : primaryIsGridContainer,
    isFlexChild: selection ? selection.supportsRole("flex-child") : primaryIsFlexChild,
    isGridChild: selection ? selection.supportsRole("grid-child") : primaryIsGridChild,
    position: selectedPosition?.kind === "common" ? selectedPosition.value : primaryPosition,
  };
}
