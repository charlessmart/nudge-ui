import type { AgentClientSnapshot } from "./client.ts";

export type AgentConnectionStatusKind =
  | "unavailable"
  | "connecting"
  | "working-disconnected"
  | "working"
  | "paired-elsewhere"
  | "not-found"
  | "ready-to-connect"
  | "connected-not-listening"
  | "listening";

export interface AgentConnectionStatus {
  readonly kind: AgentConnectionStatusKind;
  readonly label: string;
  readonly tone: "neutral" | "accent" | "warning" | "danger";
  readonly action?: {
    readonly kind: "connect" | "takeover";
    readonly label: "Connect" | "Take over";
  };
}

/** Returns the user-facing connection state shared by the prompt UI and MCP panel. */
export function getAgentConnectionStatus(snapshot: AgentClientSnapshot): AgentConnectionStatus {
  if (snapshot.state === "disabled") {
    return { kind: "unavailable", label: "Unavailable in this build", tone: "neutral" };
  }
  if (snapshot.state === "pairing") {
    return { kind: "connecting", label: "Connecting…", tone: "accent" };
  }
  if (snapshot.pairedElsewhere) {
    return {
      kind: "paired-elsewhere",
      label: "MCP active in another tab or window",
      tone: "warning",
      action: { kind: "takeover", label: "Take over" },
    };
  }
  if (!snapshot.paired && (snapshot.state === "working" || snapshot.request?.status === "working")) {
    return { kind: "working-disconnected", label: "Disconnected · Last work status unknown", tone: "warning" };
  }
  if (snapshot.paired && (snapshot.state === "working" || snapshot.request?.status === "working")) {
    return { kind: "working", label: "Connected · Agent working", tone: "accent" };
  }
  if (snapshot.paired && !snapshot.listenerActive) {
    return {
      kind: "connected-not-listening",
      label: "Project connected · Ask agent to listen",
      tone: "accent",
    };
  }
  if (!snapshot.companionReachable) {
    return { kind: "not-found", label: "Project bridge unavailable", tone: "neutral" };
  }
  if (snapshot.listenerActive) {
    return { kind: "listening", label: "Agent listening", tone: "accent" };
  }
  return {
    kind: "ready-to-connect",
    label: "Project available · Connect this page",
    tone: "accent",
    action: { kind: "connect", label: "Connect" },
  };
}
