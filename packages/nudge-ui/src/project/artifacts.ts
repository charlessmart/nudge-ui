import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { NUDGE_UI_ARTIFACTS_PATH } from "../transport/routes.ts";
import { injectStandaloneBootstrap } from "../hosts/static/html/bootstrap.ts";

export interface HtmlArtifactMetadata {
  id: string;
  sourceUrl: string;
  title: string;
  capturedAt: number;
  viewport: { width: number; height: number };
}

const ID = /^[a-f0-9-]{36}$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const INERT_INTERACTIONS = `<script data-nudge-artifact-guard>
document.addEventListener("submit", event => event.preventDefault(), true);
document.addEventListener("click", event => {
  if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
}, true);
</script>`;

async function directory(root: string, id: string): Promise<string> {
  const project = await realpath(root);
  const artifacts = join(project, ".nudge", "artifacts");
  await mkdir(artifacts, { recursive: true });
  const actual = await realpath(artifacts);
  const pathFromRoot = relative(project, actual);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("Artifact storage must remain inside the project root");
  }
  return join(actual, id);
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.byteLength;
    if (size > MAX_BYTES) throw new Error("HTML artifact exceeds 12 MB");
    chunks.push(data);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function respond(response: ServerResponse, status: number, content: string, type = "text/plain; charset=utf-8"): void {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(content);
}

/** Handles only the reserved artifact namespace. A false return lets the host continue. */
export async function handleHtmlArtifactRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  transformHtml?: (html: string) => Promise<string>,
): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://nudge-ui.local").pathname;
  if (pathname !== NUDGE_UI_ARTIFACTS_PATH && !pathname.startsWith(`${NUDGE_UI_ARTIFACTS_PATH}/`)) return false;
  const parts = pathname.slice(NUDGE_UI_ARTIFACTS_PATH.length).split("/").filter(Boolean);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          respond(response, 403, "Cross-origin artifact writes are not allowed");
          return true;
        }
      } catch { respond(response, 403, "Invalid request origin"); return true; }
    }
  }
  const id = parts[0];
  if (parts.length > 2 || (id && !ID.test(id)) || (parts.length === 2 && !["document", "baseline", "preview", "commit", "revision"].includes(parts[1]!))) {
    respond(response, 404, "Not Found");
    return true;
  }
  try {
    if (request.method === "POST" && parts.length === 0) {
      const input = await body(request);
      if (!validArtifact(input)) { respond(response, 400, "Invalid artifact"); return true; }
      const target = await directory(root, input.id);
      const temporary = `${target}.create-${crypto.randomUUID()}`;
      const metadata: HtmlArtifactMetadata = {
        id: input.id,
        sourceUrl: input.sourceUrl,
        title: input.title,
        capturedAt: Date.now(),
        viewport: input.viewport,
      };
      await mkdir(temporary);
      try {
        await writeFile(join(temporary, "baseline.html"), input.html);
        await writeFile(join(temporary, "preview.html"), input.html);
        await writeFile(join(temporary, "document.html"), input.html);
        await writeFile(join(temporary, "metadata.json"), JSON.stringify(metadata));
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
      }
      respond(response, 201, JSON.stringify(metadata), "application/json; charset=utf-8");
      return true;
    }
    if (!id) { respond(response, 405, "Method Not Allowed"); return true; }
    const target = await directory(root, id);
    if (request.method !== "DELETE") {
      const actual = await realpath(target);
      if (actual !== target) throw new Error("Artifact directory must not be a symbolic link");
    }
    if (request.method === "GET" && parts[1] === "revision") {
      const document = await readFile(join(target, "document.html"));
      const preview = await readFile(join(target, "preview.html"));
      respond(response, 200, JSON.stringify({
        document: createHash("sha256").update(document).digest("hex"),
        preview: createHash("sha256").update(preview).digest("hex"),
      }), "application/json; charset=utf-8");
      return true;
    }
    if (request.method === "GET" && parts.length === 2 && parts[1] !== "commit") {
      const file = parts[1] === "baseline" ? "baseline.html" : parts[1] === "preview" ? "preview.html" : "document.html";
      const html = await readFile(join(target, file), "utf8");
      const bootstrapped = injectStandaloneBootstrap(html).html;
      const guarded = bootstrapped.replace(/<\/body>/i, `${INERT_INTERACTIONS}</body>`);
      respond(response, 200, transformHtml ? await transformHtml(guarded) : guarded, "text/html; charset=utf-8");
      return true;
    }
    if (request.method === "GET" && parts.length === 1) {
      respond(response, 200, await readFile(join(target, "metadata.json"), "utf8"), "application/json; charset=utf-8");
      return true;
    }
    if (request.method === "PUT" && parts.length === 2) {
      if (parts[1] !== "document") { respond(response, 405, "Method Not Allowed"); return true; }
      const input = await body(request);
      if (!input || typeof input !== "object" || !("html" in input) || typeof input.html !== "string") {
        respond(response, 400, "Invalid document"); return true;
      }
      await readFile(join(target, "metadata.json"));
      const temporary = join(target, `document-${crypto.randomUUID()}.tmp`);
      await writeFile(temporary, input.html);
      await rename(temporary, join(target, "document.html"));
      respond(response, 204, "");
      return true;
    }
    if (request.method === "POST" && parts[1] === "commit") {
      const html = await readFile(join(target, "document.html"), "utf8");
      const temporary = join(target, `preview-${crypto.randomUUID()}.tmp`);
      await writeFile(temporary, html);
      await rename(temporary, join(target, "preview.html"));
      respond(response, 204, "");
      return true;
    }
    if (request.method === "DELETE" && parts.length === 1) {
      await rm(target, { recursive: true, force: true });
      respond(response, 204, "");
      return true;
    }
    respond(response, 405, "Method Not Allowed");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    respond(response, code === "ENOENT" ? 404 : code === "EEXIST" || code === "ENOTEMPTY" ? 409 : 500,
      code === "ENOENT" ? "Artifact not found" : error instanceof Error ? error.message : "Artifact storage failed");
  }
  return true;
}

function validArtifact(value: unknown): value is HtmlArtifactMetadata & { html: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const viewport = item.viewport as Record<string, unknown> | undefined;
  return typeof item.id === "string" && ID.test(item.id)
    && typeof item.sourceUrl === "string" && item.sourceUrl.length < 4096
    && typeof item.title === "string" && item.title.length < 512
    && typeof item.html === "string" && item.html.length > 0
    && !!viewport && typeof viewport.width === "number" && typeof viewport.height === "number";
}
