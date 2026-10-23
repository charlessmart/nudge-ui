import { canvasFrameHost } from "../canvas/canvasFrame.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { selectCard } from "../canvas/canvasStore.ts";
import { activateDraftForCard } from "../drafts/store.ts";
import { useEffect } from "react";
import type { ReactElement } from "react";
import { renderAnnotatedPng } from "./raster.ts";
import { sketchFrameHeading } from "./frameHeading.ts";
import { beginSketchCapture, cancelSketchInteraction, completeSketchCapture, useSketchInteraction } from "./interaction.ts";
import { initializeSketchStore, saveSketch } from "./store.ts";
import { saveAndCopySketch } from "./copySketch.ts";
import { SketchOverlay, type SketchLiveDraft } from "./SketchOverlay.tsx";
import type { CapturedSketch } from "./capture.ts";
import type { SketchPoint, SketchStroke } from "./model.ts";
import { showToast } from "../ui/Toast.tsx";

export interface SketchWorkspaceProps {
  readonly hostElement: HTMLElement | null;
  readonly projectId: string;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
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
  const interaction = useSketchInteraction();

  // Deliberately independent of the localStorage session schema; a failed
  // hydration leaves the inspector usable.
  useEffect(() => {
    void initializeSketchStore(projectId).catch(() => undefined);
  }, [projectId]);

  function selectTarget(point: SketchPoint, lockedTarget: HTMLElement | null): HTMLElement | null {
    for (const [cardId, frame] of getRegisteredFrames()) {
      const target = canvasFrameHost(frame);
      if (!target || !frame.isConnected || getComputedStyle(target).visibility === "hidden") continue;
      const bounds = frame.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) continue;
      if (lockedTarget && target !== lockedTarget) return null;
      if (target !== hostElement) {
        setSelectedElement(null);
        selectCard(cardId);
        activateDraftForCard(cardId);
        beginSketchCapture();
      }
      return target;
    }
    return null;
  }

  function copyLiveSketch(draft: SketchLiveDraft): Promise<void> {
    return saveAndCopySketch(() => copyLiveSketchImage(draft));
  }

  /**
   * Captures the page, draws the marks on it, and returns the image for the clipboard. The image is also kept so the
   * last copy can be copied again, but keeping it is best effort: a storage failure never stops the copy.
   */
  async function copyLiveSketchImage(draft: SketchLiveDraft): Promise<Blob> {
    if (!hostElement) throw new Error("The inspector is no longer available.");
    const captured = await completeSketchCapture(hostElement);
    const strokes = projectLiveStrokes(draft, captured);
    const rendered = await renderAnnotatedPng(
      captured.originalImage,
      captured.imageWidth,
      captured.imageHeight,
      strokes,
      [],
      draft.description,
      sketchFrameHeading(captured.capture.url),
    );
    try {
      await saveSketch({
        capture: captured.capture,
        description: draft.description,
        strokes,
        annotations: [],
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        originalImage: captured.originalImage,
        annotatedImage: rendered.blob,
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

  if (!hostElement) return null;
  return (
    <SketchOverlay
      open={interaction.captureState !== "idle"}
      hostElement={hostElement}
      selectTarget={selectTarget}
      onCancel={cancelSketchInteraction}
      onDone={copyLiveSketch}
    />
  );
}

export function startSketchCapture(hostElement: HTMLElement | null): void {
  if (!hostElement) return;
  beginSketchCapture();
}
