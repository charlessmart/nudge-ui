import type { ReactElement } from "react";
import { IconRobot } from "@tabler/icons-react";
import { useAgentClient, type AgentClientSnapshot } from "../agent/client.ts";
import { getAgentConnectionStatus } from "../agent/connectionStatus.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { Button } from "../ui/Button.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import type { SettingsSection } from "../settings/SettingsDialog.tsx";

export interface AgentStatusButtonProps {
  onOpenSettings: (section: SettingsSection) => void;
}

/** Renders a known MCP client logo, or a generic robot avatar. */
function ConnectedAgentAvatar({ name }: { name?: string }): ReactElement {
  const harness = name?.toLowerCase().match(/(?:^|[^a-z])(codex|claude|cursor)(?:$|[^a-z])/)?.[1];
  return (
    <span className="agent-status-button__avatars" role="img" aria-label={
      harness === "codex" ? "Codex" : harness === "claude" ? "Claude" : harness === "cursor" ? "Cursor" : "Agent"
    }>
      {harness === "codex" ? <CodexAvatar />
        : harness === "claude" ? <ClaudeAvatar />
          : harness === "cursor" ? <CursorAvatar />
            : <span className="agent-status-button__avatar"><IconRobot size={24} color="#000" aria-hidden="true" /></span>}
    </span>
  );
}

function CodexAvatar(): ReactElement {
  return (
    <span className="agent-status-button__avatar">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path
          fill="#000"
          d="M20.686 10.184a4.92 4.92 0 0 0-.435-4.092 5.1 5.1 0 0 0-2.35-2.093 5.17 5.17 0 0 0-3.15-.324A5.13 5.13 0 0 0 12.53 2.25a5.2 5.2 0 0 0-2.648-.14 5.15 5.15 0 0 0-2.364 1.185 5.05 5.05 0 0 0-1.447 2.19 5.1 5.1 0 0 0-1.953.85A5 5 0 0 0 2.693 7.9a4.98 4.98 0 0 0 .627 5.914 4.92 4.92 0 0 0 .432 4.092A5.1 5.1 0 0 0 6.104 20c.99.435 2.093.548 3.151.324.478.53 1.065.955 1.722 1.243a5.1 5.1 0 0 0 2.087.433 5.16 5.16 0 0 0 3.018-.968 5.05 5.05 0 0 0 1.858-2.537 5.1 5.1 0 0 0 1.953-.849 5 5 0 0 0 1.425-1.568 4.99 4.99 0 0 0-.632-5.894m-7.622 10.507a3.8 3.8 0 0 1-2.43-.867l.12-.067 4.037-2.299a.67.67 0 0 0 .332-.568v-5.614l1.706.974a.06.06 0 0 1 .032.043v4.653a3.73 3.73 0 0 1-1.114 2.646 3.83 3.83 0 0 1-2.683 1.099m-8.161-3.438a3.68 3.68 0 0 1-.452-2.511l.12.07 4.041 2.3a.66.66 0 0 0 .66 0l4.935-2.808v1.944a.07.07 0 0 1-.027.051l-4.09 2.326a3.85 3.85 0 0 1-2.88.373 3.8 3.8 0 0 1-2.307-1.745M3.84 8.58a3.78 3.78 0 0 1 1.998-1.644v4.73a.63.63 0 0 0 .328.564l4.912 2.796-1.707.973a.07.07 0 0 1-.06 0l-4.08-2.322a3.76 3.76 0 0 1-1.758-2.267 3.7 3.7 0 0 1 .367-2.83m14.02 3.213L12.934 8.97 14.635 8a.07.07 0 0 1 .06 0l4.08 2.326a3.77 3.77 0 0 1 1.467 1.508 3.7 3.7 0 0 1-.338 3.999 3.8 3.8 0 0 1-1.7 1.246v-4.73a.65.65 0 0 0-.343-.556m1.7-2.52-.12-.07-4.034-2.319a.66.66 0 0 0-.663 0L9.811 9.691V7.748a.05.05 0 0 1 .024-.051l4.08-2.323a3.84 3.84 0 0 1 4.073.174 3.76 3.76 0 0 0 1.332 1.63c.279.657.361 1.378.24 2.08zM8.88 12.72l-1.707-.97a.07.07 0 0 1-.032-.047v-4.64c.001-.712.207-1.409.595-2.01s.94-1.079 1.594-1.38a3.85 3.85 0 0 1 4.042.512l-.12.067-4.036 2.298a.67.67 0 0 0-.332.568zm.927-1.971 2.198-1.25 2.202 1.25v2.5l-2.194 1.25-2.202-1.25z"
        />
      </svg>
    </span>
  );
}

function ClaudeAvatar(): ReactElement {
  return (
    <span className="agent-status-button__avatar">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path
          fill="#e8704e"
          d="m5.924 15.296 3.934-2.206.066-.192-.066-.106h-.192l-.658-.04-2.248-.061-1.95-.081-1.888-.101-.476-.102L2 11.82l.046-.293.4-.268.572.05 1.266.086 1.898.132 1.377.08 2.041.213h.324l.046-.131-.112-.081-.086-.081-1.964-1.33L5.68 8.79l-1.114-.81-.602-.41-.304-.384-.132-.84.547-.602.734.05.188.051.744.572 1.59 1.23 2.076 1.527.304.253.121-.086.015-.06-.137-.228-1.129-2.04L7.377 4.94l-.536-.86-.142-.517a2.5 2.5 0 0 1-.086-.607l.623-.845L7.58 2l.83.111.35.304.516 1.179.835 1.857 1.297 2.524.38.749.202.693.076.213h.131v-.122l.107-1.421.197-1.746.193-2.246.065-.633.314-.759.623-.41.486.233.4.572-.055.37-.238 1.542-.466 2.419-.304 1.619h.177l.203-.203.82-1.087 1.377-1.72.608-.684.709-.753.455-.36h.861l.633.941-.284.972-.886 1.123-.734.951-1.053 1.417-.658 1.133.06.091.158-.015 2.38-.506 1.285-.233 1.535-.263.693.324.076.329-.273.673-1.64.405-1.925.384-2.866.678-.035.025.04.051 1.292.121.551.03h1.352l2.517.188.658.435.395.531-.066.405-1.012.516-1.368-.324-3.19-.759-1.093-.273h-.152v.091l.911.89 1.671 1.508 2.091 1.943.107.48-.269.38-.283-.04-1.838-1.381-.709-.623-1.605-1.35h-.106v.141l.37.542 1.954 2.934.1.9-.14.294-.507.177-.557-.101-1.144-1.604-1.18-1.806-.952-1.62-.117.067-.562 6.046-.263.308-.607.233-.507-.384-.268-.623.268-1.23.324-1.603.264-1.275.238-1.584.141-.526-.01-.035-.116.015-1.195 1.64-1.818 2.453-1.438 1.538-.344.137-.598-.309.056-.551.334-.491 1.99-2.53 1.2-1.568.775-.906-.005-.132h-.046l-5.286 3.43-.942.122-.405-.38.05-.622.193-.202 1.59-1.093z"
        />
      </svg>
    </span>
  );
}

function CursorAvatar(): ReactElement {
  return (
    <span className="agent-status-button__avatar">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path
          fill="#000"
          d="M11.576 2.11 3.359 6.731a.7.7 0 0 0-.262.256.7.7 0 0 0-.097.349v9.323c0 .25.138.48.359.604l8.214 4.625a.87.87 0 0 0 .853 0l8.215-4.625a.7.7 0 0 0 .262-.255.7.7 0 0 0-.097-.349V7.337a.7.7 0 0 0-.096-.35.7.7 0 0 0-.263-.255l-8.216-4.623a.88.88 0 0 0-.851 0m-7.56 5.173H19.87c.225 0 .367.24.254.43l-7.928 13.387c-.053.089-.196.053-.196-.05v-8.77a.48.48 0 0 0-.252-.425l-7.787-4.38c-.094-.053-.055-.192.052-.192"
        />
      </svg>
    </span>
  );
}

export function AgentStatusButton({ onOpenSettings }: AgentStatusButtonProps): ReactElement {
  const runtimeConfig = useNudgeUiRuntimeConfig();
  const agent = useAgentClient(runtimeConfig.projectId);
  return <AgentStatusButtonView agent={agent} onOpenSettings={onOpenSettings} />;
}

/** Renders the connection snapshot provided by the project client. */
export function AgentStatusButtonView({ agent, onOpenSettings }: AgentStatusButtonProps & {
  agent: AgentClientSnapshot;
}): ReactElement {
  const status = getAgentConnectionStatus(agent);
  const connected = agent.paired || agent.pairedElsewhere;
  const listening = connected && agent.listenerActive;

  return (
    <Tooltip content={connected ? status.label : "Agent & MCP settings"} stableTrigger>
      <Button
        variant="quiet"
        className="agent-status-button"
        aria-label={connected ? `MCP · ${status.label}` : "Settings"}
        data-test="settings-button"
        data-mcp-connected={connected ? "true" : "false"}
        data-mcp-listening={listening ? "true" : "false"}
        onClick={() => onOpenSettings("mcp")}
      >
        {connected ? <ConnectedAgentAvatar name={agent.agentClientName} /> : <span className="agent-status-button__avatars">
          <CodexAvatar />
          <ClaudeAvatar />
          <CursorAvatar />
        </span>}
        <span className="agent-status-button__label">{connected ? "MCP" : "Settings"}</span>
        {connected ? (
          <span
            className="agent-status-button__dot"
            data-test="agent-status-dot"
            aria-hidden="true"
          />
        ) : null}
      </Button>
    </Tooltip>
  );
}
