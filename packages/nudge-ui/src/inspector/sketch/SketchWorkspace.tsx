import { useEffect } from "react";
import type { ReactElement } from "react";
import { renderAnnotatedPng } from "./raster.ts";
import { closeSketchEditor, completeSketchCapture, beginSketchCapture, cancelSketchInteraction, openSketchEditor, useSketchInteraction } from "./interaction.ts";
import { initializeSketchStore, saveSketch, useSketchStore } from "./store.ts";
import { clearSketchClipboardHandoff } from "./handoff.ts";
import { SketchEditor, type SketchEditorProps } from "./SketchEditor.tsx";
import { SketchOverlay, type SketchLiveDraft } from "./SketchOverlay.tsx";
import type { CapturedSketch } from "./capture.ts";
import type { SketchAnnotation, SketchStroke } from "./model.ts";

export interface SketchWorkspaceProps {
  readonly hostElement: HTMLElement | null;
  readonly projectId: string;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

function projectLiveStrokes(draft: SketchLiveDraft, captured: CapturedSketch): SketchStroke[] {
  const scaleX = captured.imageWidth / Math.max(1, draft.viewport.width);
  const scaleY = captured.imageHeight / Math.max(1, draft.viewport.height);
  const captureScrollX = captured.capture.scrollX;
  const captureScrollY = captured.capture.scrollY;
  const visibleRight = captureScrollX + draft.viewport.width;
  const visibleBottom = captureScrollY + draft.viewport.height;

  return draft.strokes
    .filter((stroke) => stroke.points.some((point) => point.x >= captureScrollX
      && point.x <= visibleRight
      && point.y >= captureScrollY
      && point.y <= visibleBottom))
    .map((stroke) => ({
      ...stroke,
      width: stroke.width * Math.max(scaleX, scaleY),
      points: stroke.points.map((point) => ({
        x: clamp((point.x - captureScrollX) * scaleX, captured.imageWidth),
        y: clamp((point.y - captureScrollY) * scaleY, captured.imageHeight),
      })),
    }));
}

function projectLiveAnnotations(draft: SketchLiveDraft, captured: CapturedSketch): SketchAnnotation[] {
  const scaleX = captured.imageWidth / Math.max(1, draft.viewport.width);
  const scaleY = captured.imageHeight / Math.max(1, draft.viewport.height);
  const captureScrollX = captured.capture.scrollX;
  const captureScrollY = captured.capture.scrollY;
  const visibleRight = captureScrollX + draft.viewport.width;
  const visibleBottom = captureScrollY + draft.viewport.height;

  return draft.annotations
    .filter((annotation) => annotation.point.x >= captureScrollX
      && annotation.point.x <= visibleRight
      && annotation.point.y >= captureScrollY
      && annotation.point.y <= visibleBottom)
    .map((annotation) => ({
      ...annotation,
      point: {
        x: clamp((annotation.point.x - captureScrollX) * scaleX, captured.imageWidth),
        y: clamp((annotation.point.y - captureScrollY) * scaleY, captured.imageHeight),
      },
    }));
}

export function SketchWorkspace({ hostElement, projectId }: SketchWorkspaceProps): ReactElement {
  const interaction = useSketchInteraction();
  const store = useSketchStore();
  const editingDocument = interaction.editingId
    ? store.items.find((item) => item.document.id === interaction.editingId)?.document ?? null
    : null;

  // IndexedDB hydration is deliberately independent from the localStorage
  // session schema. A failed hydration leaves the inspector usable and gives
  // the Changes log a recovery message.
  useEffect(() => {
    clearSketchClipboardHandoff();
    void initializeSketchStore(projectId).catch(() => undefined);
  }, [projectId]);

  const liveOpen = interaction.editingId === null && interaction.captureState !== "idle";
  const editorOpen = interaction.editingId !== null;

  async function save(input: Parameters<SketchEditorProps["onSave"]>[0]): Promise<void> {
    await saveSketch(input);
    closeSketchEditor();
  }

  async function saveLive(draft: SketchLiveDraft): Promise<void> {
    if (!hostElement) throw new Error("The inspector is no longer available.");
    const captured = await completeSketchCapture(hostElement);
    const strokes = projectLiveStrokes(draft, captured);
    const annotations = projectLiveAnnotations(draft, captured);
    const rendered = await renderAnnotatedPng(
      captured.originalImage,
      captured.imageWidth,
      captured.imageHeight,
      strokes,
      annotations,
    );
    await save({
      capture: {
        ...captured.capture,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
      },
      description: draft.description,
      strokes,
      annotations,
      imageWidth: rendered.width,
      imageHeight: rendered.height,
      originalImage: captured.originalImage,
      annotatedImage: rendered.blob,
    });
  }

  return (
    <>
      {hostElement ? (
        <SketchOverlay
          open={liveOpen}
          hostElement={hostElement}
          onCancel={cancelSketchInteraction}
          onDone={saveLive}
        />
      ) : null}
      <SketchEditor
        open={editorOpen}
        document={editingDocument}
        captured={interaction.captured}
        onCancel={cancelSketchInteraction}
        onSave={save}
      />
    </>
  );
}

export function startSketchCapture(hostElement: HTMLElement | null): void {
  if (!hostElement) return;
  beginSketchCapture();
}

export function editSketch(sketchId: string): void {
  openSketchEditor(sketchId);
}
