import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { DiscoveredProjectRouter } from "./discovery.ts";
import { defaultSessionRegistryRoot, resolveWorkspaceRoot } from "./project.ts";
import { readLiveProjectSessions } from "./sessionRegistry.ts";
import { selectProjectSession } from "./sessionSelection.ts";

export interface ProjectTarget {
  readonly workspaceRoot?: string;
  readonly sessionId?: string;
}

/** Keeps each explicit project selection independent for the lifetime of an MCP connection. */
export class AdapterRouting {
  private closing = false;
  private readonly selections = new Map<string, Promise<DiscoveredProjectRouter>>();
  private readonly applications = new Map<string, DiscoveredProjectRouter>();

  constructor(readonly registryRoot = defaultSessionRegistryRoot()) {}

  async target({ workspaceRoot, sessionId }: ProjectTarget): Promise<DiscoveredProjectRouter> {
    if (!workspaceRoot || !isAbsolute(workspaceRoot)) {
      throw new Error("Supply workspaceRoot as the absolute path of the checkout or application you are editing.");
    }
    const applicationRoot = await realpath(workspaceRoot);
    if (this.closing) throw new Error("The MCP adapter is closing.");
    const key = JSON.stringify([applicationRoot, sessionId]);
    let selection = this.selections.get(key);
    if (!selection) {
      selection = this.select(applicationRoot, sessionId);
      this.selections.set(key, selection);
      void selection.catch(() => {
        if (this.selections.get(key) === selection) this.selections.delete(key);
      });
    }
    return await selection;
  }

  private async select(applicationRoot: string, sessionId?: string): Promise<DiscoveredProjectRouter> {
    const workspaceRoot = await resolveWorkspaceRoot(applicationRoot);
    const live = await readLiveProjectSessions(this.registryRoot);
    if (this.closing) throw new Error("The MCP adapter is closing.");
    const selected = selectProjectSession(live.map(({ descriptor }) => descriptor), {
      workspaceRoot, applicationRoot, requestedSessionId: sessionId,
    });
    const key = selected.sessionId;
    let router = this.applications.get(key)
      ?? [...this.applications.values()].find((candidate) => candidate.selectedSessionId === selected.sessionId);
    if (!router) {
      router = DiscoveredProjectRouter.forSession(selected, this.registryRoot);
      this.applications.set(key, router);
    }
    return router;
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.selections.values());
    await Promise.all([...this.applications.values()].map((router) => router.close()));
    this.selections.clear();
    this.applications.clear();
  }
}
