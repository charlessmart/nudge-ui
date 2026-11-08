import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconPower,
  IconSettings,
  IconX,
  IconTrash,
} from "@tabler/icons-react";
import {
  PromptSettingsFields,
} from "../prompt/PromptSettingsDialog.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { Button } from "../ui/Button.tsx";
import { clearRestoreCount, clearSession } from "../canvas/sessionStore.ts";
import { hasWriteLease } from "../canvas/workspaceLease.ts";
import { cancelSketchInteraction } from "../canvas/sketch/interaction.ts";
import { resetSketchMarks } from "../canvas/sketch/marksStore.ts";
import { closeNudgeUi } from "../shell/closeNudge.ts";

export type SettingsSection = "instructions";

interface SettingsSectionDefinition {
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: ReactElement;
}

const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: "instructions",
    label: "Instructions",
    icon: <IconSettings size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  },
];

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly initialSection: SettingsSection;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
}

export function SettingsDialog({
  open,
  initialSection,
  value,
  onValueChange,
  onOpenChange,
  projectId,
}: SettingsDialogProps): ReactElement {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  // Reset cannot be undone, so it asks first; the question takes the content area until it is answered.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const sections = SETTINGS_SECTIONS;
  const activeDefinition = sections.find((section) => section.id === activeSection) ?? sections[0]!;

  useEffect(() => {
    if (open) {
      setActiveSection(initialSection);
      setConfirmingReset(false);
    }
  }, [initialSection, open]);

  // The safe choice takes focus when the question appears.
  useEffect(() => {
    if (confirmingReset) cancelResetRef.current?.focus();
  }, [confirmingReset]);

  function cancelReset(): void {
    setConfirmingReset(false);
    resetButtonRef.current?.focus();
  }

  function resetCanvas(): void {
    if (!hasWriteLease()) return;
    cancelSketchInteraction();
    clearSession();
    clearRestoreCount();
    resetSketchMarks();
    onOpenChange(false);
  }

  function closeNudge(): void {
    onOpenChange(false);
    closeNudgeUi();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop className="settings__backdrop" data-test="settings-backdrop" />
        <Dialog.Popup
          className="settings__popup"
          data-test="settings-dialog"
          initialFocus={closeRef}
        >
          <Dialog.Title className="settings__visually-hidden">Settings</Dialog.Title>
          <Dialog.Description className="settings__visually-hidden">
            Configure prompting and this Nudge workspace.
          </Dialog.Description>
          <Dialog.Close
            ref={closeRef}
            className="icon-button icon-button--quiet settings__close"
            aria-label="Close settings"
            data-test="settings-close"
            type="button"
          >
            <IconX size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          </Dialog.Close>

          <div className="settings__body">
            <nav className="settings__nav" aria-label="Settings sections">
              <span className="settings__nav-label">Settings</span>
              <div className="settings__nav-items">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    className={`settings__nav-item${activeDefinition.id === section.id ? " settings__nav-item--active" : ""}`}
                    data-test={`settings-nav-${section.id}`}
                    type="button"
                    aria-current={!confirmingReset && activeDefinition.id === section.id ? "page" : undefined}
                    onClick={() => {
                      setConfirmingReset(false);
                      setActiveSection(section.id);
                    }}
                  >
                    {section.icon}
                    <span className="settings__nav-item-label">{section.label}</span>
                  </button>
                ))}
              </div>
              <button
                className="settings__nav-item settings__close-nudge"
                data-test="settings-close-nudge"
                type="button"
                onClick={closeNudge}
              >
                <IconPower size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                <span className="settings__nav-item-label">Close Nudge</span>
              </button>
              <button
                ref={resetButtonRef}
                className="settings__nav-item settings__reset-canvas"
                data-test="settings-reset-canvas"
                type="button"
                aria-current={confirmingReset ? "page" : undefined}
                onClick={() => setConfirmingReset(true)}
              >
                <IconTrash size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                <span className="settings__nav-item-label">Reset canvas</span>
              </button>
            </nav>

            <main className="settings__content" data-test="settings-content">
              {confirmingReset ? (
                <section className="settings__section" data-test="settings-reset-confirm" aria-labelledby="settings-reset-title">
                  <h2 className="settings__section-title" id="settings-reset-title">Reset the canvas?</h2>
                  <p className="settings__section-description">
                    This removes every frame, change, comment and sketch on this canvas, and it can&apos;t be undone.
                  </p>
                  <div className="settings__actions">
                    <Button ref={cancelResetRef} variant="secondary" data-test="settings-reset-cancel" onClick={cancelReset}>
                      Cancel
                    </Button>
                    <Button variant="danger" data-test="settings-reset-confirm-button" onClick={resetCanvas}>
                      Reset canvas
                    </Button>
                  </div>
                </section>
              ) : activeDefinition.id === "instructions" ? (
                <section
                  className="settings__section"
                  data-test="prompt-settings-dialog"
                  data-settings-section="instructions"
                >
                  <h2 className="settings__section-title">Custom instructions</h2>
                  <p className="settings__section-description">
                    These instructions are added to the end of every copied prompt.
                  </p>
                  <PromptSettingsFields
                    value={value}
                    onChange={onValueChange}
                    instructionsRef={instructionsRef}
                  />
                </section>
              ) : null}

            </main>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
