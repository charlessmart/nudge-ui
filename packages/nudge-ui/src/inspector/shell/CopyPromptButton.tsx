import { Menu } from "@base-ui/react/menu";
import { iterationId } from "../canvas/frameContent.ts";
import { applicationTarget } from "../drafts/model.ts";
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
import { verifyAndReconcileAgentDispatch, type AgentCompletionStatus } from "../agent/verification.ts";
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
  const activeContent = canvasCards.find((card) => card.id === activeDraftCardId)?.content;
  const activeArtifactId = iterationId(activeContent);
  const sourcePage = activeContent?.kind === "iteration" ? new URL(applicationTarget(activeContent.sourceUrl).route) : null;
  const sourceRoute = sourcePage ? `${sourcePage.pathname}${sourcePage.search}` : "";
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
  const [agentCompletionStatus, setAgentCompletionStatus] = useState<AgentCompletionStatus | null>(null);
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
  const changeCount = countPromptChanges(changes, structuralChanges, pendingSketches.length);
  const hasChanges = Boolean(activeArtifactId) || changeCount > 0;

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
    setAgentCompletionStatus(null);
    setSketchFallback(null);
    const outcome = await deliverHandoff(prepared, runtimeConfig.projectId, canSend ? agentClient : null);
    if (outcome.kind === "sketch-failed") {
      setSketchFallback({ handoff: outcome.handoff, error: outcome.error });
      return;
    }
    if (outcome.kind === "sent") return;
    setCopied(true);
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
                    <span className="copy-prompt__menu-description">Implement this design on <code>{sourceRoute}</code></span>
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
      {reconciledCount > 0 ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered" data-test="clipboard-reconciled-hint" role="status">
          {reconciledCount} Implemented changes
        </p>
      ) : null}
      {saveMessage ? (
        <p className="copy-prompt__hint copy-prompt__hint--centered" data-test="iteration-save-hint" role="status">
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
