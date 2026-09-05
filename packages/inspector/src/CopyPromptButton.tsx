import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import {
  IconChevronDown,
  IconClipboardCheck,
  IconPlugConnected,
  IconSend,
  IconSettings,
} from "@tabler/icons-react";
import { useChanges } from "./changesLog.ts";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import { copyToClipboard } from "./prompt/copyToClipboard.ts";
import { loadCustomInstructions, saveCustomInstructions } from "./prompt/promptSettings.ts";
import { PromptSettingsDialog } from "./prompt/PromptSettingsDialog.tsx";
import { McpConnectionDialog } from "./agent/McpConnectionDialog.tsx";
import { Button } from "./ui/Button.tsx";
import { IconButton } from "./ui/IconButton.tsx";
import { InspectorPopover } from "./ui/InspectorPopover.tsx";
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

export function CopyPromptButton(): ReactElement {
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptSettingsOpen, setPromptSettingsOpen] = useState(false);
  const [mcpConnectionOpen, setMcpConnectionOpen] = useState(false);
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
  const waitingForListener = agent.companionReachable
    && !agent.paired
    && !agent.listenerActive;
  const listenerHint = waitingForListener
    ? "MCP companion detected, but no agent listener is active. Ask your coding agent to call nudge_listen."
    : undefined;
  const disabled = connecting || working || (!canConnect && !hasChanges);

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

  function openPromptSettings(): void {
    setMenuOpen(false);
    setPromptSettingsOpen(true);
  }

  return (
    <div className="copy-prompt__stack" data-test="copy-prompt-control">
      <div className="copy-prompt">
        <Button
          variant="primary"
          className="copy-prompt__main"
          data-test="copy-prompt"
          type="button"
          disabled={disabled}
          data-copied={copied ? "true" : "false"}
          data-agent-state={agent.state}
          aria-busy={working || connecting ? "true" : undefined}
          title={agent.error ?? listenerHint}
          onClick={onClick}
        >
          {icon}
          {label}
        </Button>
        <InspectorPopover
          data-test="copy-prompt-menu"
          align="end"
          triggerElement={(
            <IconButton
              variant="primary"
              className="copy-prompt__menu"
              label="Copy prompt options"
              title="Copy prompt options"
              data-test="copy-prompt-menu"
              type="button"
              disabled={connecting}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <IconChevronDown size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            </IconButton>
          )}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <div className="copy-prompt__options" role="menu" aria-label="Prompt options" data-test="copy-prompt-menu-content">
            <button
              className="copy-prompt__option"
              data-test="prompt-settings-option"
              role="menuitem"
              type="button"
              onClick={openPromptSettings}
            >
              <IconSettings size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              <span>Custom instructions</span>
            </button>
            <button
              className="copy-prompt__option"
              data-test="mcp-setup-option"
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setMcpConnectionOpen(true);
              }}
            >
              <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              <span>Connect MCP…</span>
            </button>
          </div>
        </InspectorPopover>
      </div>
      {listenerHint ? (
        <p className="copy-prompt__hint" data-test="agent-listener-hint" role="status">
          {listenerHint}
        </p>
      ) : null}
      {reconciledCount > 0 ? (
        <p className="copy-prompt__hint" data-test="clipboard-reconciled-hint" role="status">
          Removed {reconciledCount} implemented {reconciledCount === 1 ? "change" : "changes"} from the next prompt.
        </p>
      ) : null}
      <PromptSettingsDialog
        open={promptSettingsOpen}
        value={customInstructions}
        onChange={handleCustomInstructionsChange}
        onOpenChange={setPromptSettingsOpen}
      />
      <McpConnectionDialog
        open={mcpConnectionOpen}
        projectId={runtimeConfig.projectId}
        origin={window.location.origin}
        snapshot={agent}
        onOpenChange={setMcpConnectionOpen}
        onConnect={() => agentClient.connect()}
        onDisconnect={() => agentClient.disconnect()}
        onCheckAgain={() => agentClient.checkConnection()}
      />
    </div>
  );
}
