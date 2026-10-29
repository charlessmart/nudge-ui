import { PromptActionButton, PromptActionRow } from "./PromptActionButton.tsx";
import { ChangesMenu } from "./ChangesLog.tsx";
import { Menu } from "@base-ui/react/menu";
import { iterationId } from "../canvas/frameContent.ts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconArtboard,
  IconBoltFilled,
  IconCheck,
  IconCopy,
  IconPencil,
} from "@tabler/icons-react";
import { useChanges } from "../drafts/store.ts";
import { countPromptChanges } from "../prompt/generatePrompt.ts";
import { loadCustomInstructions, saveCustomInstructions } from "../prompt/promptSettings.ts";
import { SettingsDialog } from "../settings/SettingsDialog.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { getStructuralChanges, subscribeStructuralChanges } from "../projection/structuralProjection.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { captureHandoffOwner } from "../prompt/handoffVerification.ts";
import { clearSentItems, getSentItems, sentItemCount } from "../workspace/sentItems.ts";
import {
  getClipboardHandoffRevision,
  getLastClipboardReconciledCount,
  subscribeClipboardHandoff,
} from "../prompt/clipboardHandoff.ts";
import { isCopyPromptShortcut, COPY_PROMPT_HOTKEY_EVENT } from "./shortcuts.ts";
import { getEditableCardId, useDrafts } from "../drafts/store.ts";
import { getFocusedCardId, getSelectedCardId, useCanvasCards, useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { copyHandoff, prepareHandoff, prepareIterationImplementationPrompt, type PreparedHandoff } from "../workspace/handoff.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { useFrameComments } from "../comments/store.ts";
import { claimShortcutKey } from "../canvas/keyboardShortcuts.ts";

export interface CopyPromptButtonProps {
  readonly settingsOpen?: boolean;
  readonly onSettingsOpenChange?: (open: boolean) => void;
  readonly onClearChanges?: () => void;
}

export function CopyPromptButton({
  settingsOpen: controlledSettingsOpen,
  onSettingsOpenChange,
  onClearChanges,
}: CopyPromptButtonProps = {}): ReactElement {
  const changes = useChanges();
  const comments = useFrameComments();
  useDrafts();
  const selectedDraftCardId = useSelectedCardId();
  const focusedDraftCardId = useFocusedCardId();
  const activeDraftCardId = getEditableCardId(selectedDraftCardId, focusedDraftCardId);
  const canvasCards = useCanvasCards();
  const activeContent = canvasCards.find((card) => card.id === activeDraftCardId)?.content;
  const activeArtifactId = iterationId(activeContent);
  const structuralChanges = useSyncExternalStore(
    subscribeStructuralChanges,
    getStructuralChanges,
    getStructuralChanges,
  );
  useSyncExternalStore(
    subscribeClipboardHandoff,
    getClipboardHandoffRevision,
    getClipboardHandoffRevision,
  );
  const reconciledCount = getLastClipboardReconciledCount();
  const [copied, setCopied] = useState(false);
  const [flashNothing, setFlashNothing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const handoffBusy = useRef(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const settingsOpen = controlledSettingsOpen ?? localSettingsOpen;
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const [customInstructions, setCustomInstructions] = useState(() =>
    loadCustomInstructions(runtimeConfig.projectId),
  );
  const hasChanges = Boolean(activeArtifactId) || countPromptChanges(changes, structuralChanges) + comments.length > 0;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!flashNothing) return;
    const timer = window.setTimeout(() => setFlashNothing(false), 1500);
    return () => window.clearTimeout(timer);
  }, [flashNothing]);

  useEffect(() => {
    setCustomInstructions(loadCustomInstructions(runtimeConfig.projectId));
  }, [runtimeConfig.projectId]);

  const changeCount = countPromptChanges(changes, structuralChanges) + comments.length;
  const badgeCount = changeCount;
  const disabled = preparing;
  const nothingToCopy = !hasChanges;

  const showingNothing = flashNothing && nothingToCopy;

  const label = showingNothing
    ? "Nothing to copy"
    : preparing
      ? "Saving iteration…"
      : copied
        ? "Copied!"
        : "Copy";

  const icon = showingNothing
    ? null
    : copied
      ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
      : <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />;

  async function onClick(): Promise<void> {
    if (disabled || handoffBusy.current) return;
    if (nothingToCopy) {
      setFlashNothing(true);
      return;
    }
    handoffBusy.current = true;
    setPreparing(Boolean(activeArtifactId));
    try { await handoff(); }
    finally { handoffBusy.current = false; setPreparing(false); }
  }

  async function copyIterationPrompt(target: "iteration" | "application"): Promise<void> {
    if (!activeArtifactId || disabled || handoffBusy.current) return;
    handoffBusy.current = true;
    setCopied(false);
    setPreparing(true);
    try {
      const request = {
        cardId: getEditableCardId(getSelectedCardId(), getFocusedCardId()),
        hints: { framework: runtimeConfig.framework, stylingSystem: runtimeConfig.stylingSystem },
        customInstructions,
      };
      if (target === "application") {
        const prompt = await prepareIterationImplementationPrompt(request);
        try { await copyToClipboard(prompt); }
        catch { throw new Error("The iteration was saved, but the prompt could not be copied. Try again."); }
      } else {
        const prepared = await prepareHandoff(request);
        try { await copyHandoff(prepared); }
        catch { throw new Error("The iteration was saved, but the prompt could not be copied. Try again."); }
      }
      setSaveMessage(null);
      setCopied(true);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The prompt could not be copied. Try again.");
    } finally {
      handoffBusy.current = false;
      setPreparing(false);
    }
  }

  async function handoff(): Promise<void> {
    if (disabled) return;
    let prepared: PreparedHandoff;
    try {
      prepared = await prepareHandoff({
        cardId: getEditableCardId(getSelectedCardId(), getFocusedCardId()),
        hints: { framework: runtimeConfig.framework, stylingSystem: runtimeConfig.stylingSystem },
        customInstructions,
      });
      setSaveMessage(null);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The HTML iteration could not be saved.");
      return;
    }
    try {
      await copyHandoff(prepared);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The prompt could not be copied. Try again.");
      return;
    }
    setCopied(true);
  }

  const handoffOwner = captureHandoffOwner(activeDraftCardId);
  const sentItems = getSentItems(handoffOwner.draftId, handoffOwner.target);
  const remainingCount = sentItemCount(sentItems);
  const showImplemented = reconciledCount > 0;

  function clearRemaining(): void {
    clearSentItems(sentItems);
  }

  useEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (!isCopyPromptShortcut(event) || !hasChanges || disabled) return;
      claimShortcutKey(event);
      void onClick();
    }

    function onRendererHotkey(): void {
      if (!hasChanges || disabled) return;
      void onClick();
    }

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener(COPY_PROMPT_HOTKEY_EVENT, onRendererHotkey);
    return () => {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener(COPY_PROMPT_HOTKEY_EVENT, onRendererHotkey);
    };
  }, [disabled, hasChanges, onClick]);

  function handleCustomInstructionsChange(value: string): void {
    setCustomInstructions(value);
    saveCustomInstructions(runtimeConfig.projectId, value);
  }

  function setSettingsOpen(open: boolean): void {
    if (onSettingsOpenChange) {
      onSettingsOpenChange(open);
    } else {
      setLocalSettingsOpen(open);
    }
  }

  const hasMenu = Boolean(activeArtifactId);
  const styleEditLabel = "Copy style edit prompt";
  const styleEditDescription = "Edits made in the inspector";

  const promptButton = (
    <PromptActionButton
      disabled={disabled}
      copied={copied}
      busy={preparing}
      onClick={hasMenu ? undefined : onClick}
      icon={icon}
      label={label}
      badgeCount={badgeCount}
      hasMenu={hasMenu}
    />
  );

  return (
    <div className="copy-prompt__stack" data-test="copy-prompt-control">
      <PromptActionRow changes={<ChangesMenu />} onClear={onClearChanges} hasChanges={changeCount > 0}>
      {hasMenu ? (
        <Menu.Root key={activeDraftCardId} modal={false}>
          <Menu.Trigger render={promptButton} />
          <Menu.Portal container={portalContainer()}>
            <Menu.Positioner className="inspector-popover__positioner" side="bottom" align="start" sideOffset={6}>
              <Menu.Popup className="inspector-popover__popup copy-prompt__menu" data-test="copy-prompt-menu">
                {activeArtifactId ? (
                  <>
                    <Menu.Item
                      className="copy-prompt__menu-item"
                      data-test="copy-iteration-prompt"
                      label="Copy iteration prompt"
                      onClick={() => void copyIterationPrompt("iteration")}
                    >
                      <IconArtboard className="copy-prompt__menu-icon" size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                      <span className="copy-prompt__menu-content">
                        <span className="copy-prompt__menu-title">Copy iteration prompt</span>
                        <span className="copy-prompt__menu-description">Continue editing this HTML iteration.</span>
                      </span>
                    </Menu.Item>
                    <Menu.Item
                      className="copy-prompt__menu-item"
                      data-test="copy-iteration-implementation"
                      label="Copy prompt for live app"
                      onClick={() => void copyIterationPrompt("application")}
                    >
                      <IconBoltFilled className="copy-prompt__menu-icon copy-prompt__menu-icon--live" size="var(--icon-size-small)" aria-hidden="true" />
                      <span className="copy-prompt__menu-content">
                        <span className="copy-prompt__menu-title">Copy prompt for live app</span>
                        <span className="copy-prompt__menu-description">Implement design in real app</span>
                      </span>
                    </Menu.Item>
                  </>
                ) : (
                  <Menu.Item
                    className="copy-prompt__menu-item"
                    data-test="copy-style-edit-prompt"
                    label={styleEditLabel}
                    onClick={() => void onClick()}
                  >
                    <IconPencil className="copy-prompt__menu-icon" size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                    <span className="copy-prompt__menu-content">
                      <span className="copy-prompt__menu-title">{styleEditLabel}</span>
                      <span className="copy-prompt__menu-description">{styleEditDescription}</span>
                    </span>
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : promptButton}
      </PromptActionRow>
      {showImplemented ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered copy-prompt__hint--implemented" data-test="handoff-implemented-hint" role="status">
          Changes implemented.
          {remainingCount > 0 ? (
            <>
              {" "}
              <button type="button" className="copy-prompt__hint-action" data-test="handoff-clear-remaining" onClick={clearRemaining}>
                Clear stale edits
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {saveMessage ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered" data-test="iteration-save-hint" role="status">
          {saveMessage}
        </p>
      ) : null}
      <SettingsDialog
        open={settingsOpen}
        initialSection="instructions"
        value={customInstructions}
        onValueChange={handleCustomInstructionsChange}
        onOpenChange={setSettingsOpen}
        projectId={runtimeConfig.projectId}
      />
    </div>
  );
}
