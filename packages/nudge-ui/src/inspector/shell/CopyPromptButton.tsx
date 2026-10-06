import { Menu } from "@base-ui/react/menu";
import { iterationId } from "../canvas/frameContent.ts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconArtboard,
  IconBoltFilled,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPlugConnected,
  IconSend,
} from "@tabler/icons-react";
import { useChanges } from "../changes/changesLog.ts";
import { countPromptChanges } from "../prompt/generatePrompt.ts";
import { loadCustomInstructions, saveCustomInstructions } from "../prompt/promptSettings.ts";
import { getAgentConnectionStatus } from "../agent/connectionStatus.ts";
import { SettingsDialog, type SettingsSection } from "../settings/SettingsDialog.tsx";
import { Button } from "../ui/Button.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { getStructuralChanges, subscribeStructuralChanges } from "../projection/structuralProjection.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import { getAgentClient, useAgentClient } from "../agent/client.ts";
import { createAgentPresentationAdapter } from "../canvas/agentPresentation.ts";
import {
  captureHandoffOwner,
  getAgentDispatch,
  verifyAndReconcileAgentDispatch,
  type HandoffSnapshot,
} from "../agent/verification.ts";
import { clearSentItems, getSentItems, sentItemCount } from "../workspace/sentItems.ts";
import {
  getClipboardHandoffRevision,
  getLastClipboardReconciledCount,
  subscribeClipboardHandoff,
} from "../prompt/clipboardHandoff.ts";
import { useSketches, settleSketchDispatch } from "../sketch/store.ts";
import { SketchLayersPanel } from "../sketch/SketchLayersPanel.tsx";
import { isSendPromptShortcut, SEND_PROMPT_HOTKEY_EVENT } from "./shortcuts.ts";
import { getFocusedCardId, getSelectedCardId, useCanvasCards, useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { getEditableCardId, sketchBelongsToCard, useDrafts } from "../drafts/store.ts";
import { copyHandoff, deliverHandoff, prepareHandoff, prepareIterationImplementationPrompt, type PreparedHandoff } from "../workspace/handoff.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";

import { useFrameComments } from "../comments/store.ts";
import { reconcileComments } from "../comments/verification.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";

export interface CopyPromptButtonProps {
  readonly settingsOpen?: boolean;
  readonly settingsSection?: SettingsSection;
  readonly onOpenSettings?: (section: SettingsSection) => void;
  readonly onSettingsOpenChange?: (open: boolean) => void;
}

export function CopyPromptButton({
  settingsOpen: controlledSettingsOpen,
  settingsSection: controlledSettingsSection,
  onOpenSettings,
  onSettingsOpenChange,
}: CopyPromptButtonProps = {}): ReactElement {
  const changes = useChanges();
  const comments = useFrameComments();
  useDrafts();
  const sketches = useSketches();
  const selectedDraftCardId = useSelectedCardId();
  const focusedDraftCardId = useFocusedCardId();
  const activeDraftCardId = getEditableCardId(selectedDraftCardId, focusedDraftCardId);
  const canvasCards = useCanvasCards();
  const activeContent = canvasCards.find((card) => card.id === activeDraftCardId)?.content;
  const activeArtifactId = iterationId(activeContent);
  const visibleSketches = sketches.filter((item) => sketchBelongsToCard(item.document, activeDraftCardId));
  const pendingSketches = visibleSketches.filter((item) => item.status === "pending");
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
  const [preparing, setPreparing] = useState(false);
  const handoffBusy = useRef(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [agentOutcome, setAgentOutcome] = useState<{ readonly removed: number; readonly dispatch: HandoffSnapshot | null } | null>(null);
  const [clipboardPhase, setClipboardPhase] = useState<"idle" | "copied" | "away" | "returned">("idle");
  const [undoClear, setUndoClear] = useState<(() => void) | null>(null);
  const [sketchFallback, setSketchFallback] = useState<{ readonly handoff: PreparedHandoff; readonly error: string } | null>(null);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const [localSettingsSection, setLocalSettingsSection] = useState<SettingsSection>("instructions");
  const settingsOpen = controlledSettingsOpen ?? localSettingsOpen;
  const settingsSection = controlledSettingsSection ?? localSettingsSection;
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const [customInstructions, setCustomInstructions] = useState(() =>
    loadCustomInstructions(runtimeConfig.projectId),
  );
  const agentClient = useMemo(
    () => getAgentClient(runtimeConfig.projectId, { origin: window.location.origin }),
    [runtimeConfig.projectId],
  );
  const agent = useAgentClient(runtimeConfig.projectId, agentClient);
  const agentRef = useRef(agent);
  agentRef.current = agent;
  const hasChanges = Boolean(activeArtifactId) || countPromptChanges(changes, structuralChanges, pendingSketches.length) + comments.length > 0;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setCustomInstructions(loadCustomInstructions(runtimeConfig.projectId));
  }, [runtimeConfig.projectId]);

  useEffect(() => {
    const canvas = createAgentPresentationAdapter({
      projectId: runtimeConfig.projectId,
      agentId: "agent",
    });
    agentClient.setCanvasCommandHandler((command) => canvas.execute(command));
    return () => {
      agentClient.setCanvasCommandHandler(undefined);
      canvas.dispose();
    };
  }, [agentClient, runtimeConfig.projectId]);

  useEffect(() => {
    const revision = agent.request?.changeRevision;
    if (agent.state !== "completed" || revision === undefined) return;
    let active = true;
    const dispatch = getAgentDispatch(revision);
    void verifyAndReconcileAgentDispatch(revision)
      .then(async (removed) => {
        for (const [, iframe] of getRegisteredFrames()) {
          if (iframe.contentDocument) await reconcileComments(iframe.contentDocument);
        }
        return removed;
      })
      .then((removed) => {
        if (!active) return;
        const latest = agentRef.current;
        if (latest.request?.changeRevision !== revision || latest.state !== "completed") return;
        setAgentOutcome({ removed, dispatch });
      })
      .catch(() => {
        if (!active) return;
        const latest = agentRef.current;
        if (latest.request?.changeRevision !== revision || latest.state !== "completed") return;
        setAgentOutcome({ removed: 0, dispatch });
      });
    return () => {
      active = false;
    };
  }, [agent.request?.changeRevision, agent.state]);

  useEffect(() => {
    const request = agent.request;
    if (!request?.sketches || request.sketches.length === 0) return;
    void settleSketchDispatch(
      request.changeRevision,
      request.status,
      request.requestId,
      request.clientDispatchId,
    ).catch(() => undefined);
  }, [agent.request?.changeRevision, agent.request?.requestId, agent.request?.clientDispatchId, agent.request?.sketches, agent.request?.status]);

  const connecting = agent.state === "pairing";
  const working = agent.state === "working" || agent.request?.status === "working";
  const canConnect = agent.companionReachable
    && agent.listenerActive
    && !agent.paired
    && !connecting
    && !working;
  const canSend = agent.paired && agent.listenerActive && !working;
  const changeCount = countPromptChanges(changes, structuralChanges, canSend ? pendingSketches.length : 0) + comments.length;
  const disabled = preparing || connecting || working || (!canConnect && !hasChanges);
  const agentStatus = getAgentConnectionStatus(agent);
  const statusAction = agentStatus.action;

  const label = preparing
    ? "Saving iteration…"
    : copied
    ? "Copied!"
    : connecting
      ? "Connecting…"
      : working
        ? "Agent working…"
        : canConnect && !activeArtifactId
          ? "Connect agent"
          : canSend && !activeArtifactId
            ? "Send prompt"
            : "Copy prompt";

  const icon = copied
    ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
    : !activeArtifactId && (canConnect || connecting)
      ? <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
      : !activeArtifactId && (canSend || working)
        ? <IconSend size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        : <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />;

  async function onClick(): Promise<void> {
    if (disabled || handoffBusy.current) return;
    handoffBusy.current = true;
    setPreparing(Boolean(activeArtifactId) && !canConnect);
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
        pendingSketches,
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
    if (canConnect) {
      await agentClient.connect();
      return;
    }
    let prepared: PreparedHandoff;
    try {
      prepared = await prepareHandoff({
        cardId: getEditableCardId(getSelectedCardId(), getFocusedCardId()),
        hints: { framework: runtimeConfig.framework, stylingSystem: runtimeConfig.stylingSystem },
        customInstructions,
        pendingSketches,
      });
      setSaveMessage(null);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The HTML iteration could not be saved.");
      return;
    }
    setAgentOutcome(null);
    setUndoClear(null);
    setClipboardPhase("idle");
    setSketchFallback(null);
    const outcome = await deliverHandoff(prepared, runtimeConfig.projectId, canSend ? agentClient : null);
    if (outcome.kind === "sketch-failed") {
      setSketchFallback({ handoff: outcome.handoff, error: outcome.error });
      return;
    }
    if (outcome.kind === "sent") return;
    setCopied(true);
    setClipboardPhase("copied");
  }

  useEffect(() => {
    if (clipboardPhase !== "copied" && clipboardPhase !== "away") return;
    // Focus moving into a canvas frame is not a return from the agent.
    const onBlur = (): void => {
      if (!(document.activeElement instanceof HTMLIFrameElement)) setClipboardPhase("away");
    };
    const onFocus = (): void => setClipboardPhase((phase) => phase === "away" ? "returned" : phase);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [clipboardPhase]);

  useEffect(() => {
    if (!undoClear) return;
    const timer = window.setTimeout(() => setUndoClear(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undoClear]);

  const handoffOwner = captureHandoffOwner(activeDraftCardId);
  const sentItems = getSentItems(handoffOwner.draftId, handoffOwner.target, agentOutcome?.dispatch ?? null);
  const remainingCount = sentItemCount(sentItems);
  const showImplemented = (agentOutcome?.removed ?? 0) > 0 || reconciledCount > 0
    || (remainingCount > 0 && (agentOutcome !== null || clipboardPhase === "returned"));

  function clearRemaining(): void {
    const restore = clearSentItems(sentItems);
    if (restore) setUndoClear(() => restore);
  }

  useEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (!isSendPromptShortcut(event) || !canSend || !hasChanges || disabled) return;
      event.preventDefault();
      void onClick();
    }

    function onRendererHotkey(): void {
      if (!canSend || !hasChanges || disabled) return;
      void onClick();
    }

    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener(SEND_PROMPT_HOTKEY_EVENT, onRendererHotkey);
    return () => {
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener(SEND_PROMPT_HOTKEY_EVENT, onRendererHotkey);
    };
  }, [canSend, disabled, hasChanges, onClick]);

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

  function openSettings(section: SettingsSection): void {
    setLocalSettingsSection(section);
    onOpenSettings?.(section);
    setSettingsOpen(true);
  }

  function openMcpConnection(): void {
    openSettings("mcp");
  }

  async function handleAgentStatusAction(): Promise<void> {
    if (statusAction?.kind === "takeover") {
      await agentClient.takeOver();
      return;
    }
    openMcpConnection();
  }

  const promptButton = (
    <Button
      variant="primary"
      className="copy-prompt__main"
      data-test="copy-prompt"
      type="button"
      disabled={disabled}
      data-copied={copied ? "true" : "false"}
      data-agent-state={agent.state}
      aria-busy={preparing || working || connecting ? "true" : undefined}
      onClick={activeArtifactId ? undefined : onClick}
    >
      {icon}
      {label}
      {changeCount > 0 ? (
        <span className="copy-prompt__change-count" data-test="copy-prompt-change-count">
          {changeCount}
        </span>
      ) : null}
      {activeArtifactId ? <IconChevronDown size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" /> : null}
    </Button>
  );

  return (
    <div className="copy-prompt__stack" data-test="copy-prompt-control">
      {activeArtifactId ? (
        <Menu.Root key={activeDraftCardId} modal={false}>
          <Menu.Trigger render={promptButton} />
          <Menu.Portal container={portalContainer()}>
            <Menu.Positioner className="inspector-popover__positioner" side="bottom" align="start" sideOffset={6}>
              <Menu.Popup className="inspector-popover__popup copy-prompt__menu" data-test="copy-prompt-menu">
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
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : promptButton}
      <SketchLayersPanel />
      {statusAction || agentStatus.kind === "connected-not-listening" ? (
        <StatusCallout
          className="copy-prompt__agent-status"
          tone={agentStatus.tone}
          data-test="agent-connection-status"
        >
          <div className="copy-prompt__agent-status-content">
            <span role="status">{agentStatus.label}</span>
            {statusAction ? (
              <Button
                size="compact"
                variant="quiet"
                data-test="agent-status-action"
                data-action={statusAction.kind}
                type="button"
                onClick={() => void handleAgentStatusAction()}
              >
                {statusAction.label}
              </Button>
            ) : null}
          </div>
        </StatusCallout>
      ) : null}
      {undoClear ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered copy-prompt__hint--implemented" data-test="handoff-cleared-hint" role="status">
          Cleared stale edits.{" "}
          <button
            type="button"
            className="copy-prompt__hint-action"
            data-test="handoff-undo-clear"
            onClick={() => {
              undoClear();
              setUndoClear(null);
            }}
          >
            Undo
          </button>
        </p>
      ) : showImplemented ? (
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
      {sketchFallback ? (
        <StatusCallout className="copy-prompt__sketch-fallback" tone="warning" data-test="sketch-dispatch-error">
          <span>{sketchFallback.error}</span>
          <Button
            size="compact"
            variant="secondary"
            type="button"
            data-test="sketch-copy-fallback"
            onClick={() => {
              void copyHandoff(sketchFallback.handoff).then(() => setSketchFallback(null)).catch(() => undefined);
            }}
          >
            Copy prompt
          </Button>
        </StatusCallout>
      ) : null}
      <SettingsDialog
        open={settingsOpen}
        initialSection={settingsSection}
        value={customInstructions}
        onValueChange={handleCustomInstructionsChange}
        onOpenChange={setSettingsOpen}
        projectId={runtimeConfig.projectId}
        origin={window.location.origin}
        snapshot={agent}
        onConnect={() => agentClient.connect()}
        onTakeOver={() => agentClient.takeOver()}
        onDisconnect={() => agentClient.disconnect()}
        onCheckAgain={() => agentClient.checkConnection()}
      />
    </div>
  );
}
