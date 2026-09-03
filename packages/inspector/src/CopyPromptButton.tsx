import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { IconChevronDown, IconClipboardCheck, IconPlugConnected, IconSend } from "@tabler/icons-react";
import { useChanges } from "./changesLog.ts";
import { generatePrompt } from "./prompt/generatePrompt.ts";
import { copyToClipboard } from "./prompt/copyToClipboard.ts";
import { Button } from "./ui/Button.tsx";
import { IconButton } from "./ui/IconButton.tsx";
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
  const runtimeConfig = getNudgeUiRuntimeConfig();
  const agentClient = useMemo(
    () => getAgentClient(runtimeConfig.projectId, { origin: window.location.origin }),
    [runtimeConfig.projectId],
  );
  const agent = useAgentClient(runtimeConfig.projectId, agentClient);
  const hasChanges = changes.length + structuralChanges.length > 0;

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
  const working = agent.state === "working";
  const canConnect = agent.state === "available";
  const canSend = agent.state === "connected" || agent.state === "completed";
  const waitingForListener = agent.state === "disconnected"
    && agent.companionReachable
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
    const text = generatePrompt(changes, hints, structuralChanges);
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
        <IconButton
          variant="primary"
          className="copy-prompt__menu"
          label="Copy prompt options"
          title="Copy prompt options"
          data-test="copy-prompt-menu"
          type="button"
          disabled={!hasChanges || working || connecting}
          aria-haspopup="menu"
        >
          <IconChevronDown size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        </IconButton>
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
    </div>
  );
}
