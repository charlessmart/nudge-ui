import { canvasFrameHost } from "../canvas/canvasFrame.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { selectCard } from "../canvas/canvasStore.ts";
import { activateDraftForCard, assignSketchToDraft, getActiveDraftChanges } from "../drafts/store.ts";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { renderAnnotatedPng } from "./raster.ts";
import { sketchFrameHeading } from "./frameHeading.ts";
import { closeSketchEditor, completeSketchCapture, beginSketchCapture, cancelSketchInteraction, openSketchEditor, useSketchInteraction } from "./interaction.ts";
import { recordCanvasChange } from "../workspace/timeline.ts";
import { getSketch, initializeSketchStore, removeSketch, saveSketch, useSketchStore } from "./store.ts";
import { clearSketchClipboardHandoff } from "./handoff.ts";
import { copySketchImage, saveAndCopySketch } from "./copySketch.ts";
import { SketchEditor, type SketchEditorProps } from "./SketchEditor.tsx";
import { SketchOverlay, type SketchLiveDraft } from "./SketchOverlay.tsx";
import type { CapturedSketch } from "./capture.ts";
import type { SketchDocument, SketchPoint, SketchStroke } from "./model.ts";
import { closeSketchNote, useSketchNote } from "./sketchNote.ts";
import { SketchPromptPanel } from "./SketchPromptPanel.tsx";

export interface SketchWorkspaceProps {
  readonly hostElement: HTMLElement | null;
  readonly projectId: string;
}

function recordSketchCreation(document: SketchDocument, owner: string): void {
  let snapshot = document;
  recordCanvasChange({
    cardIds: [],
    undo: () => {
      snapshot = getSketch(document.id)?.document ?? snapshot;
      void removeSketch(document.id);
    },
    redo: () => {
      void saveSketch({ ...snapshot, annotations: snapshot.annotations ?? [] })
        .then((saved) => assignSketchToDraft(owner, saved.id));
    },
    dispose: () => undefined,
  });
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

  return draft.strokes.flatMap((stroke) => {
    const visiblePoints = stroke.points.filter((point) => point.x >= captureScrollX
      && point.x <= visibleRight
      && point.y >= captureScrollY
      && point.y <= visibleBottom);
    if (visiblePoints.length === 0) return [];
    return [{
      ...stroke,
      width: stroke.width * Math.max(scaleX, scaleY),
      points: visiblePoints.map((point) => ({
        x: clamp((point.x - captureScrollX) * scaleX, captured.imageWidth),
        y: clamp((point.y - captureScrollY) * scaleY, captured.imageHeight),
      })),
    }];
  });
}

export function SketchWorkspace({ hostElement, projectId }: SketchWorkspaceProps): ReactElement {
  const interaction = useSketchInteraction();
  const store = useSketchStore();
  const note = useSketchNote();
  const editingDocument = interaction.editingId
    ? store.items.find((item) => item.document.id === interaction.editingId)?.document ?? null
    : null;

  // Deliberately independent of the localStorage session schema; a failed
  // hydration leaves the inspector usable.
  useEffect(() => {
    clearSketchClipboardHandoff();
    closeSketchNote();
    void initializeSketchStore(projectId).catch(() => undefined);
  }, [projectId]);

  const liveOpen = interaction.editingId === null && interaction.captureState !== "idle";
  const editorOpen = interaction.editingId !== null;
  const noteDocument = note.sketchId
    ? store.items.find((item) => item.document.id === note.sketchId)?.document ?? null
    : null;

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

  async function save(input: Parameters<SketchEditorProps["onSave"]>[0]): Promise<void> {
    const owner = interaction.draftId ?? getActiveDraftChanges().draftId;
    const saved = await saveSketch(input);
    if (!input.id) {
      assignSketchToDraft(owner, saved.id);
      recordSketchCreation(saved, owner);
    }
    closeSketchEditor();
    void copySketchImage(input.annotatedImage);
  }

  function saveLive(draft: SketchLiveDraft): Promise<void> {
    return saveAndCopySketch(() => saveLiveSketch(draft));
  }

  async function saveLiveSketch(draft: SketchLiveDraft): Promise<Blob> {
    if (!hostElement) throw new Error("The inspector is no longer available.");
    const owner = interaction.draftId ?? getActiveDraftChanges().draftId;
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
    const saved = await saveSketch({
      capture: captured.capture,
      description: draft.description,
      strokes,
      annotations: [],
      imageWidth: rendered.width,
      imageHeight: rendered.height,
      originalImage: captured.originalImage,
      annotatedImage: rendered.blob,
    });
    assignSketchToDraft(owner, saved.id);
    recordSketchCreation(saved, owner);
    closeSketchEditor();
    return rendered.blob;
  }

  function saveNote(description: string): Promise<void> {
    if (!noteDocument) return Promise.resolve();
    return saveAndCopySketch(() => saveNoteSketch(noteDocument, description));
  }

  async function saveNoteSketch(noteDocument: SketchDocument, description: string): Promise<Blob> {
    const nextDescription = description.trim();
    const rendered = await renderAnnotatedPng(
      noteDocument.originalImage,
      noteDocument.capture.imageWidth,
      noteDocument.capture.imageHeight,
      noteDocument.strokes,
      noteDocument.annotations ?? [],
      nextDescription,
      sketchFrameHeading(noteDocument.capture.url),
    );
    await saveSketch({
      id: noteDocument.id,
      capture: noteDocument.capture,
      description: nextDescription,
      strokes: noteDocument.strokes,
      annotations: noteDocument.annotations ?? [],
      imageWidth: rendered.width,
      imageHeight: rendered.height,
      originalImage: noteDocument.originalImage,
      annotatedImage: rendered.blob,
    });
    closeSketchNote();
    return rendered.blob;
  }

  return (
    <>
      {hostElement ? (
        <SketchOverlay
          open={liveOpen}
          hostElement={hostElement}
          selectTarget={selectTarget}
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
      {noteDocument ? (
        <SavedSketchNote document={noteDocument} onSave={saveNote} onCancel={closeSketchNote} />
      ) : null}
    </>
  );
}

function SavedSketchNote({
  document,
  onSave,
  onCancel,
}: {
  readonly document: SketchDocument;
  readonly onSave: (description: string) => Promise<void>;
  readonly onCancel: () => void;
}): ReactElement {
  const [description, setDescription] = useState(document.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDescription(document.description);
    setError(null);
  }, [document.id, document.revision, document.description]);

  async function done(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(description);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The sketch note could not be saved.");
      setSaving(false);
    }
  }

  return (
    <SketchPromptPanel
      dataTest="sketch-note-prompt"
      className="sketch__saved-note-panel"
      description={description}
      error={error}
      saving={saving}
      autoFocus
      onDescriptionChange={setDescription}
      onDone={done}
      onCancel={onCancel}
    />
  );
}

export function startSketchCapture(hostElement: HTMLElement | null): void {
  if (!hostElement) return;
  beginSketchCapture();
}

export function editSketch(sketchId: string): void {
  openSketchEditor(sketchId);
}
