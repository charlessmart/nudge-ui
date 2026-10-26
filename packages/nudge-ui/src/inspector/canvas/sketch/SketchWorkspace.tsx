import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { canvasFrameHost } from "../canvasFrame.ts";
import { getRegisteredFrames } from "../projection.ts";
import { setSelectedElement } from "../../selection/selectionStore.ts";
import { selectCard } from "../canvasStore.ts";
import { activateDraftForCard } from "../../drafts/store.ts";
import { useInspectorOpen } from "../../shell/openStore.ts";
import { isEditableEvent } from "../../shell/shortcuts.ts";
import { useBoardCamera, useTemporaryAppInteraction } from "../viewStore.ts";
import { SketchToolBar } from "./SketchToolBar.tsx";
import { renderSketchPng } from "../../sketch/raster.ts";
import { getSketchViewport } from "../../sketch/capture.ts";
import { beginSketchCapture, cancelSketchInteraction, completeSketchCapture, useSketchInteractionActive } from "./interaction.ts";
import { initializeSketchStore, saveSketch, useSketchStore } from "./store.ts";
import { saveAndCopySketch } from "./copySketch.ts";

import { SketchSurface } from "../../sketch/SketchSurface.tsx";
import { useSketchHistory } from "../../sketch/useSketchHistory.ts";
import { resetSketchDrawingTool, setSketchDrawingTool, setSketchStrokeColor, useSketchDrawingTools } from "../../sketch/drawingTools.ts";
import type { SketchTextEdit } from "../../sketch/SketchTextEditor.tsx";
import type { SketchPoint, SketchStroke } from "../../sketch/model.ts";
import type { CapturedSketch } from "../../sketch/capture.ts";
import { sketchInkBounds } from "../../sketch/ink.ts";
import { showToast } from "../../ui/Toast.tsx";

export interface SketchWorkspaceProps {
  readonly hostElement: HTMLElement | null;
  readonly projectId: string;
}

/** Leaves the open panel's reserved space uncovered; matches the canvas toolbar layer. */
const PANEL_RESERVED_INSET = { left: "var(--panel-reserve-start)", right: "var(--panel-reserve-end)" } as const;

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

export interface SketchLiveDraft {
  readonly strokes: readonly SketchStroke[];
  readonly viewport: ReturnType<typeof getSketchViewport>;
}

export function projectLiveStrokes(draft: SketchLiveDraft, captured: CapturedSketch): SketchStroke[] {
  const scaleX = captured.imageWidth / Math.max(1, draft.viewport.width);
  const scaleY = captured.imageHeight / Math.max(1, draft.viewport.height);
  const captureScrollX = captured.capture.scrollX;
  const captureScrollY = captured.capture.scrollY;
  const visibleRight = captureScrollX + draft.viewport.width;
  const visibleBottom = captureScrollY + draft.viewport.height;

  // Layers pushed flush against the viewport edge may overshoot it by rounding error.
  const slack = 0.5;
  const isVisible = (point: SketchPoint): boolean => point.x >= captureScrollX - slack
    && point.x <= visibleRight + slack
    && point.y >= captureScrollY - slack
    && point.y <= visibleBottom + slack;
  const typeScale = Math.max(scaleX, scaleY);

  return draft.strokes.flatMap((stroke) => {
    // Cropping a text box would leave its words half-drawn, so it is kept whole or not at all.
    const visiblePoints = stroke.kind === "text"
      ? stroke.points.every(isVisible) ? stroke.points : []
      : stroke.points.filter(isVisible);
    if (visiblePoints.length === 0) return [];
    return [{
      ...stroke,
      width: stroke.width * typeScale,
      ...(stroke.fontSize === undefined ? {} : { fontSize: stroke.fontSize * typeScale }),
      points: visiblePoints.map((point) => ({
        x: clamp((point.x - captureScrollX) * scaleX, captured.imageWidth),
        y: clamp((point.y - captureScrollY) * scaleY, captured.imageHeight),
      })),
    }];
  });
}

export function SketchWorkspace({ hostElement, projectId }: SketchWorkspaceProps): ReactElement | null {
  const active = useSketchInteractionActive();
  const history = useSketchHistory();
  const drawing = useSketchDrawingTools();
  const recents = useSketchStore().documents;
  const inspectorOpen = useInspectorOpen();
  const temporaryAppInteraction = useTemporaryAppInteraction();
  const camera = useBoardCamera();
  const [textEdit, setTextEdit] = useState<SketchTextEdit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Deliberately independent of the localStorage session schema; a failed
  // hydration leaves the inspector usable.
  useEffect(() => {
    void initializeSketchStore(projectId).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!active) return;
    resetSketchDrawingTool();
    history.reset();
    setTextEdit(null);
    setSubmitting(false);
  }, [active, history.reset]);

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
      if (isRedo) history.redo();
      else history.undo();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, history.redo, history.undo]);

  if (!hostElement) return null;
  const host = hostElement;

  function selectTarget(point: SketchPoint, lockedTarget: HTMLElement | null): HTMLElement | null {
    for (const [cardId, frame] of getRegisteredFrames()) {
      const target = canvasFrameHost(frame);
      if (!target || !frame.isConnected || getComputedStyle(target).visibility === "hidden") continue;
      const bounds = frame.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) continue;
      if (lockedTarget && target !== lockedTarget) return null;
      if (target !== host) {
        setSelectedElement(null);
        selectCard(cardId);
        activateDraftForCard(cardId);
        beginSketchCapture();
      }
      return target;
    }
    return null;
  }

  /**
   * Captures the page, draws the marks on it, and returns the image for the clipboard. The image is also kept so the
   * last copy can be copied again, but keeping it is best effort: a storage failure never stops the copy.
   */
  async function copyLiveSketchImage(draft: SketchLiveDraft): Promise<Blob> {
    const captured = await completeSketchCapture(host);
    const strokes = projectLiveStrokes(draft, captured);
    const rendered = await renderSketchPng(
      captured.pageImage,
      captured.imageWidth,
      captured.imageHeight,
      strokes,
    );
    try {
      await saveSketch({
        url: captured.capture.url,
        image: rendered.blob,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        ink: sketchInkBounds(strokes, rendered.width, rendered.height) ?? undefined,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Sketch not kept",
        description: error instanceof Error ? error.message : "The copied sketch could not be saved for later.",
      });
    }
    // The sketch tool stays open on a fresh canvas, ready for the next one.
    beginSketchCapture();
    return rendered.blob;
  }

  async function copySketch(): Promise<void> {
    if (submitting || history.history.strokes.length === 0) return;
    setSubmitting(true);
    try {
      await saveAndCopySketch(() => copyLiveSketchImage({
        strokes: history.history.strokes,
        viewport: getSketchViewport(host),
      }));
      // Once saved the sketch is done with: the canvas starts empty again and the tool stays open for the next one.
      history.reset();
      setTextEdit(null);
      setSubmitting(false);
    } catch (error) {
      showToast({
        tone: "error",
        title: "Sketch not copied",
        description: error instanceof Error ? error.message : "The sketch could not be saved.",
      });
      setSubmitting(false);
    }
  }

  return (
    <>
      <SketchSurface
        open={active}
        hostElement={hostElement}
        selectTarget={selectTarget}
        onCancel={cancelSketchInteraction}
        history={history.history}
        addStroke={history.addStroke}
        eraseStrokes={history.eraseStrokes}
        transformStroke={history.transformStroke}
        textEdit={textEdit}
        setTextEdit={setTextEdit}
        submitting={submitting}
        tool={drawing.tool}
        color={drawing.color.value}
        inspectorOpen={inspectorOpen}
        temporaryAppInteraction={temporaryAppInteraction}
        layoutKey={`${camera.x},${camera.y},${camera.zoom}`}
      />
      {active ? (
        <div
          className="sketch-bar-layer"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          style={inspectorOpen ? PANEL_RESERVED_INSET : undefined}
        >
          <SketchToolBar
            open
            tool={drawing.tool}
            color={drawing.color}
            recents={recents}
            saving={submitting}
            hasContent={history.history.strokes.length > 0}
            onToolChange={setSketchDrawingTool}
            onColorChange={setSketchStrokeColor}
            onSave={() => void copySketch()}
          />
        </div>
      ) : null}
    </>
  );
}

export function startSketchCapture(hostElement: HTMLElement | null): void {
  if (!hostElement) return;
  beginSketchCapture();
}
