import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { canvasFrameElement, canvasFrameHost } from "../canvasFrame.ts";
import { getFrameRegistryVersion, getRegisteredFrames, subscribeFrameRegistry } from "../projection.ts";
import { setSelectedElement } from "../../selection/selectionStore.ts";
import { selectCard } from "../canvasStore.ts";
import { activateDraftForCard } from "../../drafts/store.ts";
import { useInspectorOpen } from "../../shell/openStore.ts";
import { isEditableEvent } from "../../shell/shortcuts.ts";
import { portalContainer } from "../../ui/portalContainer.ts";
import { useBoardCamera, useTemporaryAppInteraction } from "../viewStore.ts";
import { SketchToolBar } from "./SketchToolBar.tsx";
import { cancelSketchInteraction, openSketchInteraction, sketchOpenedByKeyboard, useSketchInteractionActive } from "./interaction.ts";
import { clearAllSketchMarks, hasSketchMarks, setSketchEditingKey, useSketchMarks } from "./marksStore.ts";
import { SketchMarks } from "./SketchMarks.tsx";
import { useSketchMarksKey } from "./sketchFrames.ts";
import { takeSketchScreenshot } from "./screenshot.ts";
import { copyScreenshot } from "./copySketch.ts";

import { SketchSurface } from "../../sketch/SketchSurface.tsx";
import { resetSketchDrawingTool, setSketchDrawingTool, setSketchStrokeColor, useSketchDrawingTools } from "../../sketch/drawingTools.ts";
import type { SketchTextEdit } from "../../sketch/SketchTextEditor.tsx";
import type { SketchPoint } from "../../sketch/model.ts";

export interface SketchWorkspaceProps {
  readonly hostElement: HTMLElement | null;
}

/** Matches the "Copied" toast. */
const COPIED_TICK_MS = 3000;

/** Leaves the open panel's reserved space uncovered; matches the canvas toolbar layer. */
const PANEL_RESERVED_INSET = { left: "var(--panel-reserve-start)", right: "var(--panel-reserve-end)" } as const;

/** The page surface has no card to hold its marks, so they cover the page from the inspector's own layer. */
function PageSurfaceMarks(): ReactElement | null {
  useSyncExternalStore(subscribeFrameRegistry, getFrameRegistryVersion, getFrameRegistryVersion);
  const container = portalContainer();
  if (!container) return null;
  const pages = [...getRegisteredFrames()].filter(([, frame]) => !canvasFrameElement(frame));
  if (pages.length === 0) return null;
  return createPortal(
    <>
      {pages.map(([cardId, frame]) => (
        <SketchMarks key={cardId} cardId={cardId} host={canvasFrameHost(frame)} placement="page" />
      ))}
    </>,
    container,
  );
}

export function SketchWorkspace({ hostElement }: SketchWorkspaceProps): ReactElement {
  const active = useSketchInteractionActive();
  const drawing = useSketchDrawingTools();
  const inspectorOpen = useInspectorOpen();
  const temporaryAppInteraction = useTemporaryAppInteraction();
  const camera = useBoardCamera();
  const marksKey = useSketchMarksKey(hostElement);
  const marks = useSketchMarks(marksKey);
  const [textEdit, setTextEdit] = useState<SketchTextEdit | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);

  // The tick on the screenshot button lasts as long as the "Copied" toast.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_TICK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!active) return;
    resetSketchDrawingTool();
    setTextEdit(null);
  }, [active]);

  // The surface draws the frame it is editing; every other frame keeps its marks in the passive layer.
  useEffect(() => {
    setSketchEditingKey(active ? marksKey : null);
  }, [active, marksKey]);
  useEffect(() => () => setSketchEditingKey(null), []);

  // Window-level so undo works while focus is in the canvas toolbar; text fields keep their native undo.
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isEditableEvent(event)) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      const isUndo = key === "z" && !event.shiftKey;
      if (!isRedo && !isUndo) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) marks.redo();
      else marks.undo();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, marks.redo, marks.undo]);

  /** A press on any frame draws on that frame; its marks and history are its own. */
  function selectTarget(point: SketchPoint): HTMLElement | null {
    for (const [cardId, frame] of getRegisteredFrames()) {
      const target = canvasFrameHost(frame);
      if (!target || !frame.isConnected || getComputedStyle(target).visibility === "hidden") continue;
      const bounds = frame.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) continue;
      if (target !== hostElement) {
        setSelectedElement(null);
        selectCard(cardId);
        activateDraftForCard(cardId);
      }
      return target;
    }
    return null;
  }

  /** Called straight from the click: without the extension it asks to share the screen, which needs the gesture. */
  function takeScreenshot(): void {
    if (capturing) return;
    setCapturing(true);
    const landing = (): Element | null => portalContainer()?.querySelector('[data-test="sketch-screenshot"]') ?? null;
    setCopied(false);
    void copyScreenshot(takeSketchScreenshot(), landing).then((done) => {
      setCapturing(false);
      setCopied(done);
    });
  }

  return (
    <>
      <PageSurfaceMarks />
      {hostElement ? (
        <SketchSurface
          open={active}
          hostElement={hostElement}
          selectTarget={selectTarget}
          onCancel={cancelSketchInteraction}
          history={marks.history}
          addStroke={marks.addStroke}
          eraseStrokes={marks.eraseStrokes}
          transformStroke={marks.transformStroke}
          textEdit={textEdit}
          setTextEdit={setTextEdit}
          submitting={capturing}
          tool={drawing.tool}
          color={drawing.color.value}
          inspectorOpen={inspectorOpen}
          temporaryAppInteraction={temporaryAppInteraction}
          layoutKey={`${camera.x},${camera.y},${camera.zoom}`}
        />
      ) : null}
      {active ? (
        <div
          className="sketch-bar-layer"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          style={inspectorOpen ? PANEL_RESERVED_INSET : undefined}
        >
          <SketchToolBar
            open
            intro={!sketchOpenedByKeyboard()}
            tool={drawing.tool}
            color={drawing.color}
            capturing={capturing}
            copied={copied}
            hasMarks={hasSketchMarks()}
            onToolChange={setSketchDrawingTool}
            onColorChange={setSketchStrokeColor}
            onScreenshot={takeScreenshot}
            onClear={clearAllSketchMarks}
          />
        </div>
      ) : null}
    </>
  );
}

export function startSketch(hostElement: HTMLElement | null, options?: { readonly viaKeyboard?: boolean }): void {
  if (!hostElement) return;
  openSketchInteraction(options);
}
