import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteCatalog } from "../transport/routeCatalog.ts";
import { handleRouteCatalogRequest } from "./routes.ts";
import { handleHtmlArtifactRequest } from "./artifacts.ts";

export interface WorkspaceHost {
  readonly root: string;
  readonly framework: RouteCatalog["framework"];
  readonly pageExtensions?: string[];
  readonly catalog?: RouteCatalog;
  readonly basePath?: string;
  readonly htmlEntries?: readonly string[];
  readonly transformStudy?: (html: string) => Promise<string>;
}

export async function handleWorkspaceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  host: WorkspaceHost,
): Promise<boolean> {
  const handled = await handleRouteCatalogRequest(
    request, response, host.root, host.framework,
    host.pageExtensions, host.catalog, host.basePath, host.htmlEntries,
  );
  if (handled) return true;
  return handleHtmlArtifactRequest(request, response, host.root, host.transformStudy);
}
