import type { AgentClientSnapshot } from "@inspector/agent/client.ts";

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly target: "none" | "text" | "flex" | "grid" | "button" | "mixed" | "controls" | "component-button" | "component-badge" | "component-card" | "component-nested" | "media-desktop-first" | "media-mobile-first";
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
  { id: "component-button", title: "Component: Button", description: "A button component with variant, size and disabled props.", target: "component-button", scope: "source-site" },
  { id: "component-badge", title: "Component: Badge", description: "A badge component with tone and size props.", target: "component-badge" },
  { id: "component-card", title: "Component: Card", description: "A card component selected at its root.", target: "component-card" },
  { id: "component-nested", title: "Component: nested", description: "A button inside a card, selected as the inner element.", target: "component-nested" },
  { id: "media-desktop-first", title: "Media: desktop first", description: "Padding, gap, font size and width change at max-width breakpoints. Resize the window to move the highlighted segment.", target: "media-desktop-first" },
  { id: "media-mobile-first", title: "Media: mobile first", description: "Padding and font size grow at min-width breakpoints, so the base sits at the small end.", target: "media-mobile-first" },
  { id: "mixed", title: "Mixed selection", description: "Two text elements with different font sizes, colors and spacing.", target: "mixed" },
  { id: "changes", title: "Pending changes", description: "Two fixture edits, the changes log and the enabled prompt action.", target: "text" },
  { id: "empty", title: "Empty panel", description: "The real empty state and keyboard shortcut disclosure.", target: "none" },
  { id: "unavailable", title: "Inspection error", description: "A page-level error with long content.", target: "none", error: "its security policy" },
  { id: "controls", title: "Controlled fields", description: "Real token fields driven by fixture values and local callbacks. No selected DOM element required.", target: "controls" },
];

export function agentFixture(connected: boolean): AgentClientSnapshot {
  return { state: connected ? "connected" : "disconnected", connection: connected ? "paired" : "offline", listenerActive: connected, companionReachable: connected, paired: connected, pairedElsewhere: false, request: null, agentClientName: connected ? "Codex" : undefined };
}
