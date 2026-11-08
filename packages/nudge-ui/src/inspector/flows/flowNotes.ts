import type { FlowStateStatus } from "../../transport/flows.ts";

export interface FlowNote { readonly test: string; readonly tone: "warn" | "info"; readonly text: string; readonly items: readonly string[] }

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** What a replay saw beyond its writes: the lines that tell a person, or the agent, why a frame may not show what the recipe means. */
export function flowNotes(result: FlowStateStatus): FlowNote[] {
  const notes: FlowNote[] = [];
  if (result.unusedRules?.length) {
    notes.push({ test: "flows-unused", tone: "warn", text: `${plural(result.unusedRules.length, "mock matched", "mocks matched")} no request`, items: result.unusedRules });
  }
  if (result.foreignMatches?.length) {
    notes.push({ test: "flows-foreign", tone: "info", text: `A relative mock answered another host's request`, items: result.foreignMatches });
  }
  if (result.heldConnections?.length) {
    notes.push({ test: "flows-held", tone: "info", text: `Held ${plural(result.heldConnections.length, "live connection", "live connections")}`, items: result.heldConnections });
  }
  if (result.passedThrough?.length) {
    notes.push({ test: "flows-passed", tone: "info", text: `${plural(result.passedThrough.length, "request", "requests")} reached a real server`, items: result.passedThrough });
  }
  return notes;
}
