import { parentPort } from "node:worker_threads";
import type ts from "typescript";
import type { ComponentContract } from "./componentContractTypes.ts";
import { extractProjectComponentContracts } from "./projectComponentContracts.ts";

export interface ProjectContractRequest {
  id: number;
  root: string;
  files: string[];
  /** Absolute file to the project-relative path recorded in contracts. */
  catalogPaths: Record<string, string>;
}

export type ProjectContractResponse =
  | { id: number; contracts: ComponentContract[] }
  | { id: number; error: string };

const port = parentPort;
if (port) {
  // The previous program makes a rebuild after one edit re-check only what the edit reaches.
  let previous: ts.Program | undefined;
  port.on("message", (request: ProjectContractRequest) => {
    try {
      const result = extractProjectComponentContracts({
        root: request.root,
        files: request.files,
        oldProgram: previous,
        catalogPath: (file) => request.catalogPaths[file] ?? file,
      });
      previous = result.program;
      port.postMessage({ id: request.id, contracts: result.contracts } satisfies ProjectContractResponse);
    } catch (error) {
      port.postMessage({
        id: request.id,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      } satisfies ProjectContractResponse);
    }
  });
}
