import type { AgentClientSnapshot } from "@inspector/agent/client.ts";

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly target: "none" | "text" | "flex" | "grid" | "button" | "mixed" | "controls";
  readonly scope?: "source-site" | "rendered-instance";
  readonly error?: string;
  readonly connected?: boolean;
}

/** Serializable initial states; browser-dependent editor values come from FixtureTargets. */
export const scenarios: readonly Scenario[] = [
  { id: "typography", title: "Typography", description: "Text, color tokens, border and shadow controls.", target: "text" },
  { id: "flex", title: "Flex layout", description: "Flex direction, alignment, gap, padding and sizing.", target: "flex" },
  { id: "grid", title: "Grid layout", description: "Grid templates, alignment and spacing.", target: "grid" },
  { id: "linked", title: "Linked elements", description: "Repeated buttons with shared source, hover styles and a connected agent.", target: "button", scope: "source-site", connected: true },
  { id: "unlinked", title: "Unlinked element", description: "A single instance and the relink callout.", target: "button", scope: "rendered-instance" },
  { id: "mixed", title: "Mixed selection", description: "Two text elements with different font sizes, colors and spacing.", target: "mixed" },
  { id: "changes", title: "Pending changes", description: "Two fixture edits, the changes log and the enabled prompt action.", target: "text" },
  { id: "empty", title: "Empty panel", description: "The real empty state and keyboard shortcut disclosure.", target: "none" },
  { id: "unavailable", title: "Inspection error", description: "A page-level error with long content.", target: "none", error: "its security policy" },
  { id: "controls", title: "Controlled fields", description: "Real token fields driven by fixture values and local callbacks. No selected DOM element required.", target: "controls" },
];

export function agentFixture(connected: boolean): AgentClientSnapshot {
  return { state: connected ? "connected" : "disconnected", connection: connected ? "paired" : "offline", listenerActive: connected, companionReachable: connected, paired: connected, pairedElsewhere: false, request: null, agentClientName: connected ? "Codex" : undefined };
}
