import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconCheck,
  IconClipboardCheck,
  IconPlugConnected,
  IconSend,
} from "@tabler/icons-react";
import { useChanges } from "./changesLog.ts";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import { copyToClipboard } from "./prompt/copyToClipboard.ts";
import { loadCustomInstructions, saveCustomInstructions } from "./prompt/promptSettings.ts";
import { getAgentConnectionStatus } from "./agent/connectionStatus.ts";
import { SettingsDialog, type SettingsSection } from "./settings/SettingsDialog.tsx";
import { Button } from "./ui/Button.tsx";
import { StatusCallout } from "./ui/StatusCallout.tsx";
import { getStructuralChanges, subscribeStructuralChanges } from "./structuralProjection.ts";
import { getNudgeUiRuntimeConfig } from "./runtimeConfig.ts";
import {
  createPromptRevision,
  getAgentClient,
  useAgentClient,
} from "./agent/client.ts";
import { createAgentPresentationAdapter } from "./canvas/agentPresentation.ts";
import {
  discardAgentDispatch,
  recordAgentDispatch,
  verifyAndReconcileAgentDispatch,
} from "./agent/verification.ts";
import {
  getClipboardHandoffRevision,
  getLastClipboardReconciledCount,
  recordClipboardHandoff,
  subscribeClipboardHandoff,
} from "./prompt/clipboardHandoff.ts";

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
  const hasChanges = changes.length + structuralChanges.length > 0;

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
    void verifyAndReconcileAgentDispatch(revision);
  }, [agent.request?.changeRevision, agent.state]);

  const connecting = agent.state === "pairing";
  const working = agent.state === "working" || agent.request?.status === "working";
  const canConnect = agent.companionReachable
    && agent.listenerActive
    && !agent.paired
    && !connecting
    && !working;
  const canSend = agent.paired && agent.listenerActive && !working;
  const disabled = connecting || working || (!canConnect && !hasChanges);
  const agentStatus = getAgentConnectionStatus(agent);
  const statusAction = agentStatus.action;

  const label = copied
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

  const icon = canConnect || connecting
    ? <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
    : canSend || working
      ? <IconSend size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
      : <IconClipboardCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />;

  async function onClick(): Promise<void> {
    if (disabled) return;
    if (canConnect) {
      await agentClient.connect();
      return;
    }
    const hints = {
      framework: runtimeConfig.framework,
      stylingSystem: runtimeConfig.stylingSystem,
    };
    const text = generatePrompt(changes, hints, structuralChanges, customInstructions);
    if (canSend) {
      const revision = createPromptRevision(changes, structuralChanges);
      recordAgentDispatch(revision, changes, structuralChanges);
      const response = await agentClient.dispatchPrompt(
        text,
        revision,
      );
      if (response) return;
      discardAgentDispatch(revision);
    }
    await copyToClipboard(text);
    recordClipboardHandoff(changes, structuralChanges);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

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

  return (
    <div className="copy-prompt__stack" data-test="copy-prompt-control">
      <Button
        variant="primary"
        className="copy-prompt__main"
        data-test="copy-prompt"
        type="button"
        disabled={disabled}
        data-copied={copied ? "true" : "false"}
        data-agent-state={agent.state}
        aria-busy={working || connecting ? "true" : undefined}
        title={agent.error}
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
      {statusAction ? (
        <StatusCallout
          className="copy-prompt__agent-status"
          tone={agentStatus.tone}
          data-test="agent-connection-status"
        >
          <div className="copy-prompt__agent-status-content">
            <span role="status">{agentStatus.label}</span>
            <Button
              size="compact"
              variant="quiet"
              data-test="agent-status-action"
              data-action={statusAction.kind}
              type="button"
              onClick={openMcpConnection}
            >
              {statusAction.label}
            </Button>
          </div>
        </StatusCallout>
      ) : agentStatus.kind === "listening" ? (
        <div
          className="copy-prompt__agent-status copy-prompt__agent-status--listening"
          data-test="agent-connection-status"
          role="status"
        >
          <IconCheck size="var(--icon-size-small)" stroke={2} aria-hidden="true" />
          <span>{agentStatus.label}</span>
        </div>
      ) : null}
      {reconciledCount > 0 ? (
        <p className="copy-prompt__hint" data-test="clipboard-reconciled-hint" role="status">
          Removed {reconciledCount} implemented {reconciledCount === 1 ? "change" : "changes"} from the next prompt.
        </p>
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
        onDisconnect={() => agentClient.disconnect()}
        onCheckAgain={() => agentClient.checkConnection()}
      />
    </div>
  );
}
