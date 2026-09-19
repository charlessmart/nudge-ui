import type { KeyboardEvent, ReactElement } from "react";
import { Button } from "../ui/Button.tsx";
import { SKETCH_LIMITS } from "./model.ts";

export interface SketchPromptPanelProps {
  readonly dataTest: string;
  readonly className?: string;
  readonly description: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly doneDisabled?: boolean;
  readonly saving?: boolean;
  readonly autoFocus?: boolean;
  readonly onDescriptionChange: (value: string) => void;
  readonly onDone: () => void | Promise<void>;
  readonly onCancel?: () => void;
}

/** The small note editor shared by a new live sketch and saved sketch layers. */
export function SketchPromptPanel({
  dataTest,
  className,
  description,
  error = null,
  disabled = false,
  doneDisabled = false,
  saving = false,
  autoFocus = false,
  onDescriptionChange,
  onDone,
  onCancel,
}: SketchPromptPanelProps): ReactElement {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !disabled && !saving && !doneDisabled) {
      event.preventDefault();
      void onDone();
    }
  }

  return (
    <section
      className={`sketch__prompt-panel${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-label="Sketch note"
      data-test={dataTest}
    >
      <label className="sketch__prompt-label sketch__sr-only" htmlFor={`${dataTest}-input`}>Sketch note</label>
      <textarea
        id={`${dataTest}-input`}
        className="sketch__prompt-input"
        value={description}
        rows={2}
        maxLength={SKETCH_LIMITS.description}
        placeholder="Add a note to your sketch"
        aria-label="Sketch note"
        data-test={`${dataTest}-input`}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(event) => onDescriptionChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="sketch__prompt-footer">
        {error ? <span className="sketch__prompt-error" role="status">{error}</span> : <span />}
        <Button
          variant="primary"
          type="button"
          data-test={`${dataTest}-done`}
          disabled={disabled || saving || doneDisabled}
          onClick={() => { void onDone(); }}
        >
          {saving ? "Saving…" : "Done"}
        </Button>
      </div>
    </section>
  );
}
