import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { SketchViewport } from "./viewport.ts";
import {
  SKETCH_LIMITS,
  SKETCH_TEXT_FONT_FAMILY,
  SKETCH_TEXT_FONT_WEIGHT,
  SKETCH_TEXT_LINE_HEIGHT,
  type SketchPoint,
  type SketchStrokeColor,
} from "./model.ts";
import { measureSketchText, sketchTextPadding } from "./text.ts";

/** A text layer being typed: where its box starts, how it is turned, and what it looked like before. */
export interface SketchTextEdit {
  readonly id: string;
  /** Top-left corner of the unrotated box, in drawing coordinates. */
  readonly corner: SketchPoint;
  readonly rotation: number;
  readonly fontSize: number;
  readonly color: SketchStrokeColor;
  readonly initialText: string;
  /** True when changing an existing layer rather than adding one. */
  readonly replacing: boolean;
}

export interface SketchTextEditorProps {
  readonly edit: SketchTextEdit;
  readonly viewport: SketchViewport;
  /** Drawing units per screen pixel. */
  readonly unit: number;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
}

/** Room for the caret after the last glyph, in drawing units. */
const CARET_ROOM_EM = 0.1;

export function SketchTextEditor({ edit, viewport, unit, onCommit, onCancel }: SketchTextEditorProps): ReactElement {
  const [text, setText] = useState(edit.initialText);
  const input = useRef<HTMLTextAreaElement>(null);
  // Blur follows Enter and Escape, so only the first way out of the editor counts.
  const finished = useRef(false);
  const metrics = measureSketchText(text, edit.fontSize);
  // The note reaches past the words, which still start at the layer's corner.
  const padding = sketchTextPadding(edit.fontSize);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  function finish(commit: boolean): void {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(text);
    else onCancel();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") {
      // The sketch itself closes on Escape; here it only abandons this edit.
      event.preventDefault();
      event.stopPropagation();
      finish(false);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      finish(true);
    }
  }

  return (
    <textarea
      ref={input}
      className="sketch__text-editor"
      value={text}
      rows={1}
      maxLength={SKETCH_LIMITS.text}
      spellCheck={false}
      aria-label="Sketch text"
      data-test="sketch-text-editor"
      style={{
        left: (edit.corner.x - viewport.scrollX - padding) / unit,
        top: (edit.corner.y - viewport.scrollY - padding) / unit,
        width: (metrics.width + edit.fontSize * CARET_ROOM_EM + padding * 2) / unit,
        height: (metrics.height + padding * 2) / unit,
        padding: padding / unit,
        color: edit.color,
        fontFamily: SKETCH_TEXT_FONT_FAMILY,
        fontWeight: SKETCH_TEXT_FONT_WEIGHT,
        fontSize: edit.fontSize / unit,
        lineHeight: SKETCH_TEXT_LINE_HEIGHT,
        transform: `rotate(${edit.rotation}rad)`,
        transformOrigin: `${padding / unit}px ${padding / unit}px`,
      }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}
