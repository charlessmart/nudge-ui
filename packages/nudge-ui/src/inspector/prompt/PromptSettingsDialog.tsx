import { useRef } from "react";
import type { ReactElement, RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { IconX } from "@tabler/icons-react";

export interface PromptSettingsDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}

export interface PromptSettingsFieldsProps {
  value: string;
  onChange: (value: string) => void;
  instructionsRef?: RefObject<HTMLTextAreaElement | null>;
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
}

/** Edits the instructions appended to every generated prompt. */
export function PromptSettingsFields({
  value,
  onChange,
  instructionsRef,
}: PromptSettingsFieldsProps): ReactElement {
  return (
    <>
      <div className="prompt-settings__field">
        <textarea
          ref={instructionsRef}
          id="nudge-ui-custom-instructions"
          className="prompt-settings__textarea"
          data-test="prompt-custom-instructions"
          aria-label="Custom instructions"
          rows={6}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
      <div className="prompt-settings__actions">
        <Dialog.Close className="button button--primary" data-test="prompt-settings-done" type="button">
          Done
        </Dialog.Close>
      </div>
    </>
  );
}

export function PromptSettingsDialog({
  open,
  value,
  onChange,
  onOpenChange,
}: PromptSettingsDialogProps): ReactElement {
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop className="prompt-settings__backdrop" data-test="prompt-settings-backdrop" />
        <Dialog.Popup
          className="prompt-settings__popup"
          data-test="prompt-settings-dialog"
          initialFocus={instructionsRef}
        >
          <div className="prompt-settings__header">
            <Dialog.Title className="prompt-settings__title">Custom instructions</Dialog.Title>
            <Dialog.Close
              className="icon-button icon-button--quiet prompt-settings__close"
              aria-label="Close custom instructions"
              data-test="prompt-settings-close"
              type="button"
            >
              <IconX size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="prompt-settings__description">
            These instructions are added to the end of every copied prompt.
          </Dialog.Description>
          <PromptSettingsFields
            value={value}
            onChange={onChange}
            instructionsRef={instructionsRef}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
