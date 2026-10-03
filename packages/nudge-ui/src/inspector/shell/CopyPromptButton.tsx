import { beginActivityDispatch } from "../agent/activity.ts";
import { studyArtifactId } from "../canvas/frameContent.ts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconCheck,
  IconCopy,
  IconPlugConnected,
  IconSend,
} from "@tabler/icons-react";
import { useChanges } from "../changes/changesLog.ts";
import { countPromptChanges, generatePrompt } from "../prompt/generatePrompt.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { loadCustomInstructions, saveCustomInstructions } from "../prompt/promptSettings.ts";
import { getAgentConnectionStatus } from "../agent/connectionStatus.ts";
import { SettingsDialog, type SettingsSection } from "../settings/SettingsDialog.tsx";
import { Button } from "../ui/Button.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { getStructuralChanges, subscribeStructuralChanges } from "../projection/structuralProjection.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  createPromptRevision,
  getAgentClient,
  useAgentClient,
} from "../agent/client.ts";
import { createAgentPresentationAdapter } from "../canvas/agentPresentation.ts";
import {
  discardAgentDispatch,
  recordAgentDispatch,
  captureHandoffOwner,
  type HandoffSnapshot,
  verifyAndReconcileAgentDispatch,
  type AgentCompletionStatus,
} from "../agent/verification.ts";
import {
  getClipboardHandoffRevision,
  getLastClipboardReconciledCount,
  recordClipboardHandoff,
  subscribeClipboardHandoff,
} from "../prompt/clipboardHandoff.ts";
import { useSketches, markSketchesDispatching, markSketchesHandingOff, settleSketchDispatch } from "../sketch/store.ts";
import {
  createSketchAttachments,
  createSketchHandoffSnapshot,
  sketchMetadataForHandoff,
} from "../sketch/handoff.ts";
import { SketchLayersPanel } from "../sketch/SketchLayersPanel.tsx";
import { isSendPromptShortcut, SEND_PROMPT_HOTKEY_EVENT } from "./shortcuts.ts";
import { getCanvasCards, getFocusedCardId, getSelectedCardId, useCanvasCards, useFocusedCardId, useSelectedCardId } from "../canvas/canvasStore.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { getEditableCardId, getWorkspaceForCard, sketchBelongsToCard, useDrafts } from "../drafts/store.ts";
import { htmlStudyPrompt } from "../artifacts/prompt.ts";
import { prepareHtmlStudyHandoff } from "../artifacts/study.ts";

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
  useDrafts();
  const sketches = useSketches();
  const selectedDraftCardId = useSelectedCardId();
  const focusedDraftCardId = useFocusedCardId();
  const activeDraftCardId = getEditableCardId(selectedDraftCardId, focusedDraftCardId);
  const canvasCards = useCanvasCards();
  const activeArtifactId = studyArtifactId(canvasCards.find((card) => card.id === activeDraftCardId)?.content);
  const visibleSketches = sketches.filter((item) => sketchBelongsToCard(item.document.id, activeDraftCardId));
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
  const [agentCompletionStatus, setAgentCompletionStatus] = useState<AgentCompletionStatus | null>(null);
  const [sketchFallback, setSketchFallback] = useState<{
    readonly prompt: string;
    readonly error: string;
    readonly handoff: HandoffSnapshot;
  } | null>(null);
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
  const changeCount = countPromptChanges(changes, structuralChanges, pendingSketches.length);
  const hasChanges = Boolean(activeArtifactId) || changeCount > 0;

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
    void verifyAndReconcileAgentDispatch(revision)
      .then((removed) => {
        if (!active) return;
        const latest = agentRef.current;
        if (latest.request?.changeRevision !== revision || latest.state !== "completed") return;
        setAgentCompletionStatus(removed > 0 ? "verified" : null);
      })
      .catch(() => {
        if (!active) return;
        const latest = agentRef.current;
        if (latest.request?.changeRevision !== revision || latest.state !== "completed") return;
        setAgentCompletionStatus(null);
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
  const disabled = preparing || connecting || working || (!canConnect && !hasChanges);
  const agentStatus = getAgentConnectionStatus(agent);
  const statusAction = agentStatus.action;

  const label = preparing
    ? "Saving study…"
    : copied
    ? "Copied!"
    : connecting
      ? "Connecting…"
      : working
        ? "Agent working…"
        : canConnect
          ? "Connect agent"
          : canSend
            ? "Send prompt"
            : "Copy prompt";

  const icon = copied
    ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
    : canConnect || connecting
      ? <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
      : canSend || working
        ? <IconSend size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        : <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />;

  async function onClick(): Promise<void> {
    if (disabled || handoffBusy.current) return;
    handoffBusy.current = true;
    setPreparing(Boolean(activeArtifactId) && !canConnect);
    try { await handoff(); }
    finally { handoffBusy.current = false; setPreparing(false); }
  }

  async function handoff(): Promise<void> {
    if (disabled) return;
    if (canConnect) {
      await agentClient.connect();
      return;
    }
    const activeCardId = getEditableCardId(getSelectedCardId(), getFocusedCardId());
    const activeCard = getCanvasCards().find((card) => card.id === activeCardId);
    const owner = captureHandoffOwner(activeCardId);
    const editTarget = owner.target;
    const hints = {
      framework: editTarget.kind === "html"
        ? "HTML"
        : runtimeConfig.framework,
      stylingSystem: runtimeConfig.stylingSystem,
    };
    const draftWorkspace = activeCardId ? getWorkspaceForCard(activeCardId) : null;
    let promptChanges = draftWorkspace ? [...draftWorkspace.changes] : changes;
    let promptStructural = draftWorkspace ? [...draftWorkspace.structuralChanges] : structuralChanges;
    const sketchHandoff = createSketchHandoffSnapshot(pendingSketches);
    const sketchMetadata = sketchHandoff ? sketchMetadataForHandoff(sketchHandoff) : [];
    if (activeCard && editTarget.kind === "html") {
      const frame = getRegisteredFrames().get(activeCard.id);
      if (!frame) {
        setSaveMessage("The HTML study is still loading. Try again when the frame is ready.");
        return;
      }
      try {
        const saved = await prepareHtmlStudyHandoff(activeCard.id, editTarget.artifactId, frame);
        promptChanges = [...saved.changes];
        promptStructural = [...saved.structuralChanges];
        setSaveMessage(null);
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : "The HTML study could not be saved.");
        return;
      }
    }
    const basePrompt = generatePrompt(promptChanges, hints, promptStructural, customInstructions, sketchMetadata);
    const text = editTarget.kind === "html"
      ? htmlStudyPrompt(editTarget.artifactId, basePrompt, promptChanges.length + promptStructural.length === 0, visibleSketches.length > 0, customInstructions)
      : basePrompt;
    const prepared: HandoffSnapshot = { owner, changes: promptChanges, structuralChanges: promptStructural };
    setAgentCompletionStatus(null);
    setSketchFallback(null);
    if (canSend) {
      const revision = createPromptRevision(promptChanges, promptStructural, sketchMetadata);
      recordAgentDispatch(revision, promptChanges, promptStructural, owner);
      const clientDispatchId = sketchHandoff?.localBatchId ?? `dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let attachments = undefined;
      try {
        if (sketchHandoff) {
          await markSketchesDispatching(
            sketchHandoff.entries.map((entry) => ({ id: entry.id, revision: entry.revision })),
            revision,
            sketchHandoff.localBatchId,
          );
          attachments = await createSketchAttachments(sketchHandoff);
        }
        beginActivityDispatch(runtimeConfig.projectId, clientDispatchId, owner.frameIds);
        const response = await agentClient.dispatchPrompt(text, revision, {
          clientDispatchId,
          ...(attachments === undefined ? {} : { attachments }),
        });
        if (response) {
          if (sketchHandoff) {
            await markSketchesHandingOff(
              sketchHandoff.entries.map((entry) => ({ id: entry.id, revision: entry.revision })),
              revision,
              sketchHandoff.localBatchId,
              response.request.requestId,
            );
          }
          return;
        }
        if (sketchHandoff) {
          await settleSketchDispatch(revision, "failed", undefined, sketchHandoff.localBatchId);
          discardAgentDispatch(revision);
          const latestAgent = agentClient.getSnapshot();
          setSketchFallback({
            prompt: text,
            handoff: prepared,
            error: latestAgent.request?.error
              ?? latestAgent.error
              ?? "The agent did not accept the sketch attachments.",
          });
          return;
        }
      } catch (error) {
        discardAgentDispatch(revision);
        if (sketchHandoff) {
          await settleSketchDispatch(revision, "failed", undefined, sketchHandoff.localBatchId).catch(() => undefined);
          setSketchFallback({
            prompt: text,
            handoff: prepared,
            error: error instanceof Error ? error.message : "The sketch could not be sent to the agent.",
          });
          return;
        }
      }
      discardAgentDispatch(revision);
    }
    await copyToClipboard(text);
    if (editTarget.kind === "application" && (promptChanges.length > 0 || promptStructural.length > 0)) {
      recordClipboardHandoff(promptChanges, promptStructural, owner);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
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
      onClick={onClick}
    >
      {icon}
      {label}
      {changeCount > 0 ? (
        <span className="copy-prompt__change-count" data-test="copy-prompt-change-count">
          {changeCount}
        </span>
      ) : null}
    </Button>
  );

  return (
    <div className="copy-prompt__stack" data-test="copy-prompt-control">
      {promptButton}
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
      {reconciledCount > 0 ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered" data-test="clipboard-reconciled-hint" role="status">
          {reconciledCount} Implemented changes
        </p>
      ) : null}
      {saveMessage ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered" data-test="study-save-hint" role="status">
          {saveMessage}
        </p>
      ) : null}
      {agentCompletionStatus === "verified" ? (
        <p className="copy-prompt__hint" data-test="agent-verified-hint" role="status">
          Agent changes verified.
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
              void copyToClipboard(sketchFallback.prompt).then(() => {
                const { owner, changes, structuralChanges } = sketchFallback.handoff;
                if (owner.target.kind === "application" && (changes.length > 0 || structuralChanges.length > 0)) {
                  recordClipboardHandoff(changes, structuralChanges, owner);
                }
                setSketchFallback(null);
              }).catch(() => undefined);
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
