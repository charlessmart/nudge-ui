import { useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconCheck,
  IconCopy,
  IconPlugConnected,
  IconRefresh,
  IconUnlink,
  IconX,
} from "@tabler/icons-react";
import type { AgentClientSnapshot } from "./client.ts";
import { getAgentConnectionStatus } from "./connectionStatus.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { Button } from "../ui/Button.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";
import { portalContainer } from "../ui/portalContainer.ts";

export const MCP_DOCS_URL = "https://github.com/charlessmart/nudge-ui#connect-a-coding-agent";

/** Uses the guided installer so browser diagnostics never become shell arguments. */
export function createMcpSetupCommand(): string {
  return "npx nudge-ui agent setup";
}

export interface McpConnectionContentProps {
  readonly projectId: string;
  readonly origin: string;
  readonly snapshot: AgentClientSnapshot;
  readonly onConnect: () => Promise<boolean> | boolean | void;
  readonly onTakeOver: () => Promise<boolean> | boolean | void;
  readonly onDisconnect: () => void;
  readonly onCheckAgain: () => Promise<void>;
}

export interface McpConnectionDialogProps extends McpConnectionContentProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function TimelineStep({
  number,
  complete,
  title,
  children,
}: {
  number: number;
  complete: boolean;
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <li
      className={`mcp-connection__timeline-step${complete ? " mcp-connection__timeline-step--complete" : ""}`}
      data-test={`mcp-step-${number}`}
      data-complete={complete ? "true" : "false"}
    >
      <div className="mcp-connection__timeline-marker" aria-hidden="true">
        {complete ? <IconCheck size="var(--icon-size-small)" stroke={2} /> : number}
      </div>
      <section className="mcp-connection__timeline-content">
        <h3 className="mcp-connection__section-title">{title}</h3>
        {children}
      </section>
    </li>
  );
}

/** Renders the MCP setup and pairing flow without owning a dialog surface. */
export function McpConnectionContent({
  projectId,
  origin,
  snapshot,
  onConnect,
  onTakeOver,
  onDisconnect,
  onCheckAgain,
}: McpConnectionContentProps): ReactElement {
  const [checking, setChecking] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedDoctor, setCopiedDoctor] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>();
  const [checkError, setCheckError] = useState<string | undefined>();
  const setupCommand = createMcpSetupCommand();
  const setupPrompt = useMemo(() => [
    "Please set up the Nudge coding-agent integration for this application.",
    "",
    "Run this command from the application directory and select this coding agent:",
    setupCommand,
    "",
    "Start the application normally. Reload the agent if needed, then listen to Nudge.",
  ].join("\n"), [setupCommand]);
  const doctorCommand = "nudge-ui agent doctor";
  const status = getAgentConnectionStatus(snapshot);
  const showConnectionStatus = status.kind !== "not-found"
    || Boolean(snapshot.error || checkError || snapshot.request?.summary || snapshot.request?.error);
  const canConnect = snapshot.companionReachable
    && !snapshot.paired
    && !snapshot.pairedElsewhere
    && snapshot.state !== "pairing"
    && snapshot.state !== "working"
    && snapshot.request?.status !== "working";
  const canDisconnect = snapshot.paired || snapshot.request?.status === "working";
  const canTakeOver = snapshot.companionReachable
    && snapshot.pairedElsewhere
    && snapshot.state !== "pairing"
    && snapshot.state !== "working"
    && snapshot.request?.status !== "working";

  async function handleCheckAgain(): Promise<void> {
    if (checking) return;
    setChecking(true);
    setCheckError(undefined);
    try {
      await onCheckAgain();
    } catch {
      setCheckError("The connection could not be checked. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function handleCopyCommand(): Promise<void> {
    setCopyError(undefined);
    try {
      await copyToClipboard(setupCommand);
      setCopiedCommand(true);
      window.setTimeout(() => setCopiedCommand(false), 1500);
    } catch {
      setCopyError("The setup command could not be copied. Select it and copy it manually.");
    }
  }

  async function handleCopyPrompt(): Promise<void> {
    setCopyError(undefined);
    try {
      await copyToClipboard(setupPrompt);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      setCopyError("The AI setup prompt could not be copied. Select it and copy it manually.");
    }
  }

  async function handleCopyDoctor(): Promise<void> {
    setCopyError(undefined);
    try {
      await copyToClipboard(doctorCommand);
      setCopiedDoctor(true);
      window.setTimeout(() => setCopiedDoctor(false), 1500);
    } catch {
      setCopyError("The diagnostic command could not be copied. Select it and copy it manually.");
    }
  }

  return (
    <>
      {showConnectionStatus ? (
        <StatusCallout
          className="mcp-connection__status"
          tone={status.tone}
          data-test="mcp-connection-status"
        >
          <span className="mcp-connection__status-label" role="status">{status.label}</span>
          {snapshot.error ? (
            <span className="mcp-connection__status-detail">{snapshot.error}</span>
          ) : null}
          {checkError ? <span role="alert">{checkError}</span> : null}
          {snapshot.request?.summary ? (
            <span className="mcp-connection__status-detail">{snapshot.request.summary}</span>
          ) : null}
          {snapshot.request?.error ? (
            <span className="mcp-connection__status-detail">{snapshot.request.error}</span>
          ) : null}
        </StatusCallout>
      ) : null}

      <ol className="mcp-connection__timeline" data-test="mcp-connection-timeline">
        <TimelineStep
          number={1}
          complete={snapshot.companionReachable || snapshot.listenerActive || snapshot.request !== null}
          title="Set up agent"
        >
          <p className="mcp-connection__copy">
            Agent prompt
          </p>
          <div className="mcp-connection__command-block">
            <IconButton
              className="mcp-connection__copy-button"
              variant="quiet"
              size="compact"
              label={copiedPrompt ? "Copied" : "Copy setup instructions"}
              data-test="mcp-copy-setup-prompt"
              onClick={() => void handleCopyPrompt()}
            >
              {copiedPrompt ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
            </IconButton>
            <pre className="mcp-connection__command"><code data-test="mcp-setup-prompt">{setupPrompt}</code></pre>
          </div>
          <p className="mcp-connection__copy">
            Or, terminal command
          </p>
          <div className="mcp-connection__command-block">
            <IconButton
              className="mcp-connection__copy-button"
              variant="quiet"
              size="compact"
              label={copiedCommand ? "Copied" : "Copy command"}
              data-test="mcp-copy-command"
              onClick={() => void handleCopyCommand()}
            >
              {copiedCommand ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
            </IconButton>
            <pre className="mcp-connection__command"><code data-test="mcp-setup-command">{setupCommand}</code></pre>
          </div>
        </TimelineStep>

        <TimelineStep number={2} complete={snapshot.listenerActive} title="Tell agent to listen for instructions">
          <p className="mcp-connection__copy">
            Tell your coding agent: “Listen to Nudge.”
          </p>
        </TimelineStep>
      </ol>

      <Disclosure className="mcp-connection__details" title="Troubleshooting" defaultOpen>
        <p className="mcp-connection__copy">To diagnose setup</p>
        <div className="mcp-connection__command-block">
          <IconButton
            className="mcp-connection__copy-button"
            variant="quiet"
            size="compact"
            label={copiedDoctor ? "Copied" : "Copy diagnostic command"}
            data-test="mcp-copy-doctor"
            onClick={() => void handleCopyDoctor()}
          >
            {copiedDoctor ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          </IconButton>
          <pre className="mcp-connection__command"><code>{doctorCommand}</code></pre>
        </div>
          <dl className="mcp-connection__diagnostics" data-test="mcp-connection-diagnostics">
            <div className="mcp-connection__diagnostic">
              <dt>Project ID</dt>
              <dd data-test="mcp-project-id">{projectId}</dd>
            </div>
            <div className="mcp-connection__diagnostic">
              <dt>Origin</dt>
              <dd data-test="mcp-origin">{origin}</dd>
            </div>
          </dl>
          <div className="mcp-connection__actions">
            {canTakeOver ? (
              <Button
                variant="primary"
                data-test="mcp-takeover"
                type="button"
                onClick={() => void onTakeOver()}
              >
                <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                Take over
              </Button>
            ) : null}
            {canConnect ? (
              <Button
                variant="primary"
                data-test="mcp-connect"
                type="button"
                onClick={() => void onConnect()}
              >
                <IconPlugConnected size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                Connect
              </Button>
            ) : null}
            <Button
              variant="quiet"
              data-test="mcp-check-again"
              type="button"
              disabled={checking || snapshot.state === "disabled" || snapshot.state === "pairing"}
              onClick={() => void handleCheckAgain()}
            >
              <IconRefresh size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              {checking ? "Checking…" : "Refresh connection"}
            </Button>
            {canDisconnect ? (
              <Button
                variant="danger"
                data-test="mcp-disconnect"
                type="button"
                onClick={onDisconnect}
              >
                <IconUnlink size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                {snapshot.paired ? "Disconnect" : "Forget connection"}
              </Button>
            ) : null}
          </div>
      </Disclosure>

      {copyError ? <p className="mcp-connection__error" role="alert">{copyError}</p> : null}

    </>
  );
}

/**
 * Explains and controls the project-scoped MCP companion connection.
 *
 * This compatibility wrapper keeps the existing standalone MCP surface while
 * the shared content is also embedded in the general settings modal.
 */
export function McpConnectionDialog({
  open,
  projectId,
  origin,
  snapshot,
  onOpenChange,
  onConnect,
  onTakeOver,
  onDisconnect,
  onCheckAgain,
}: McpConnectionDialogProps): ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portalContainer()}>
        <Dialog.Backdrop className="mcp-connection__backdrop" data-test="mcp-connection-backdrop" />
        <Dialog.Popup
          className="mcp-connection__popup"
          data-test="mcp-connection-dialog"
          initialFocus={closeRef}
        >
          <div className="mcp-connection__header">
            <div>
              <Dialog.Title className="mcp-connection__title">Connect MCP</Dialog.Title>
              <Dialog.Description className="mcp-connection__description">
                Set up your coding agent once, then ask it to listen to Nudge in this worktree.
              </Dialog.Description>
            </div>
            <Dialog.Close
              ref={closeRef}
              className="icon-button icon-button--quiet mcp-connection__close"
              aria-label="Close MCP connection"
              data-test="mcp-connection-close"
              type="button"
            >
              <IconX size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <McpConnectionContent
            projectId={projectId}
            origin={origin}
            snapshot={snapshot}
            onConnect={onConnect}
            onTakeOver={onTakeOver}
            onDisconnect={onDisconnect}
            onCheckAgain={onCheckAgain}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
