import { useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  IconCheck,
  IconClipboard,
  IconExternalLink,
  IconPlugConnected,
  IconRefresh,
  IconUnlink,
  IconX,
} from "@tabler/icons-react";
import type { AgentClientSnapshot } from "./client.ts";
import { getAgentConnectionStatus } from "./connectionStatus.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { Button } from "../ui/Button.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StatusCallout } from "../ui/StatusCallout.tsx";

export const MCP_DOCS_URL = "https://github.com/charlessmart/nudge-ui#connect-a-coding-agent";

/** Quotes one value for a POSIX shell command. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function shellArgument(value: string): string {
  // Keep the usual command readable while quoting values that could be
  // interpreted as shell syntax when add-mcp runs the nested command.
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : shellQuote(value);
}

/** Builds the project-local add-mcp command shown by the connection panel. */
export function createMcpSetupCommand(projectId: string, origin: string): string {
  const serverCommand = [
    "npx -y @nudge-ui/mcp@latest",
    "--project-id",
    shellArgument(projectId),
    "--origin",
    shellArgument(origin),
    "--workspace-root .",
  ].join(" ");
  return `npx add-mcp ${shellQuote(serverCommand)} --name nudge_ui`;
}

export interface McpConnectionContentProps {
  readonly projectId: string;
  readonly origin: string;
  readonly snapshot: AgentClientSnapshot;
  readonly onConnect: () => Promise<boolean> | boolean | void;
  readonly onDisconnect: () => void;
  readonly onCheckAgain: () => Promise<void>;
}

export interface McpConnectionDialogProps extends McpConnectionContentProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function portalContainer(): HTMLElement | ShadowRoot | null {
  return typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
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
  onDisconnect,
  onCheckAgain,
}: McpConnectionContentProps): ReactElement {
  const [checking, setChecking] = useState(false);
  const [setupMethod, setSetupMethod] = useState<"terminal" | "ai">("terminal");
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedListener, setCopiedListener] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>();
  const [checkError, setCheckError] = useState<string | undefined>();
  const setupCommand = useMemo(() => createMcpSetupCommand(projectId, origin), [origin, projectId]);
  const setupPrompt = useMemo(() => [
    "Please configure the Nudge MCP companion for this project.",
    "",
    "Run this command from the project root:",
    setupCommand,
    "",
    "Then restart or refresh the MCP server so Nudge can connect.",
  ].join("\n"), [setupCommand]);
  const listenerInstruction = "Call nudge_listen now and wait for my Nudge UI prompt. After applying it, call nudge_report_status and listen again.";
  const status = getAgentConnectionStatus(snapshot);
  const canConnect = snapshot.companionReachable
    && !snapshot.paired
    && snapshot.state !== "pairing"
    && snapshot.state !== "working"
    && snapshot.request?.status !== "working";
  const canDisconnect = snapshot.paired || snapshot.request?.status === "working";

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

  async function handleCopyListener(): Promise<void> {
    setCopyError(undefined);
    try {
      await copyToClipboard(listenerInstruction);
      setCopiedListener(true);
      window.setTimeout(() => setCopiedListener(false), 1500);
    } catch {
      setCopyError("The listener instruction could not be copied. Select it and copy it manually.");
    }
  }

  return (
    <>
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

      <ol className="mcp-connection__timeline" data-test="mcp-connection-timeline">
        <TimelineStep
          number={1}
          complete={snapshot.companionReachable}
          title="Configure the MCP host"
        >
          <SegmentedControl
            aria-label="MCP setup method"
            className="mcp-connection__setup-tabs"
            data-test="mcp-setup-tabs"
            value={setupMethod}
            options={[
              { value: "terminal", label: "Terminal command", testId: "mcp-setup-tab-terminal" },
              { value: "ai", label: "AI instructions", testId: "mcp-setup-tab-ai" },
            ]}
            onChange={setSetupMethod}
          />
          {setupMethod === "terminal" ? (
            <>
              <p className="mcp-connection__copy">
                Run this command from your project root.
              </p>
              <pre className="mcp-connection__command"><code data-test="mcp-setup-command">{setupCommand}</code></pre>
              <div className="mcp-connection__command-actions">
                <Button
                  variant="secondary"
                  data-test="mcp-copy-command"
                  type="button"
                  onClick={() => void handleCopyCommand()}
                >
                  {copiedCommand ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" /> : <IconClipboard size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />}
                  {copiedCommand ? "Copied" : "Copy command"}
                </Button>
              </div>
              <p className="mcp-connection__note">
                After running the command, restart or refresh your coding agent's MCP server, then check again.
              </p>
            </>
          ) : (
            <>
              <p className="mcp-connection__copy">
                Copy this prompt into your coding agent to configure Nudge MCP.
              </p>
              <pre className="mcp-connection__command"><code data-test="mcp-setup-prompt">{setupPrompt}</code></pre>
              <div className="mcp-connection__command-actions">
                <Button
                  variant="secondary"
                  data-test="mcp-copy-setup-prompt"
                  type="button"
                  onClick={() => void handleCopyPrompt()}
                >
                  {copiedPrompt ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" /> : <IconClipboard size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />}
                  {copiedPrompt ? "Copied" : "Copy prompt"}
                </Button>
              </div>
            </>
          )}
        </TimelineStep>

        <TimelineStep number={2} complete={snapshot.paired} title="Connect this page">
          <dl className="mcp-connection__diagnostics" data-test="mcp-connection-diagnostics">
            <div className="mcp-connection__diagnostic">
              <dt>Project ID</dt>
              <dd data-test="mcp-project-id"><code>{projectId}</code></dd>
            </div>
            <div className="mcp-connection__diagnostic">
              <dt>Origin</dt>
              <dd data-test="mcp-origin"><code>{origin}</code></dd>
            </div>
          </dl>
          <div className="mcp-connection__actions">
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
              {checking ? "Checking…" : "Check again"}
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
        </TimelineStep>

        <TimelineStep number={3} complete={snapshot.listenerActive} title="Start the agent listener">
          <p className="mcp-connection__copy">
            Ask your coding agent to call <code>nudge_listen</code> and keep it active.
          </p>
          <div className="mcp-connection__command-actions">
            <Button
              variant="secondary"
              data-test="mcp-copy-listener"
              type="button"
              onClick={() => void handleCopyListener()}
            >
              {copiedListener ? <IconCheck size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" /> : <IconClipboard size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />}
              {copiedListener ? "Copied" : "Copy listener instruction"}
            </Button>
          </div>
        </TimelineStep>
      </ol>

      {copyError ? <p className="mcp-connection__error" role="alert">{copyError}</p> : null}

      <a
        className="mcp-connection__docs"
        data-test="mcp-docs-link"
        href={MCP_DOCS_URL}
        target="_blank"
        rel="noreferrer"
      >
        <IconExternalLink size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        Read the MCP connection guide
      </a>
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
                Pair this page with your coding agent. You can connect before the agent starts listening.
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
            onDisconnect={onDisconnect}
            onCheckAgain={onCheckAgain}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
