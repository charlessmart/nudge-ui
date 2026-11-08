import type { IncomingMessage } from "node:http";

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || undefined;
}

/**
 * Whether a write came from the page this server serves. A request with no `Origin` is not from a browser page.
 * Next.js reaches its sidecar through a rewrite that replaces `Host`, so the page's host is also accepted from
 * `X-Forwarded-Host`; a cross-site page cannot set that header without a preflight the sidecar never answers.
 */
export function isSameOriginRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { return false; }
  const hosts = [request.headers.host, firstValue(request.headers["x-forwarded-host"])];
  return hosts.some((host) => host !== undefined && host === originHost);
}
