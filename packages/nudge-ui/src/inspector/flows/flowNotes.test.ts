import { describe, expect, it } from "vitest";
import type { FlowStateStatus } from "../../transport/flows.ts";
import { flowNotes } from "./flowNotes.ts";

const base: FlowStateStatus = { flowId: "chat", stateId: "list", ok: true, at: 1, durationMs: 5, blocked: [] };

describe("flowNotes", () => {
  it("says nothing for a clean replay", () => {
    expect(flowNotes(base)).toEqual([]);
  });

  it("names rules that matched nothing, as a warning", () => {
    const [note] = flowNotes({ ...base, unusedRules: ["GET /api/conversations", "POST /api/chat"] });
    expect(note).toMatchObject({ test: "flows-unused", tone: "warn", text: "2 mocks matched no request" });
    expect(note?.items).toEqual(["GET /api/conversations", "POST /api/chat"]);
  });

  it("separates a relative rule answering another host, held connections and reads that reached a server", () => {
    const notes = flowNotes({
      ...base,
      foreignMatches: ["POST /auth/v1/token -> POST https://x.supabase.co/auth/v1/token"],
      heldConnections: ["WebSocket wss://x.supabase.co/realtime/v1/websocket"],
      passedThrough: ["GET /api/me"],
    });
    expect(notes.map((note) => [note.test, note.tone])).toEqual([
      ["flows-foreign", "info"],
      ["flows-held", "info"],
      ["flows-passed", "info"],
    ]);
    expect(notes[1]?.text).toBe("Held 1 live connection");
    expect(notes[2]?.text).toBe("1 request reached a real server");
  });
});
