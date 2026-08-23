import { projectRoot } from "virtual:design-tool-astro-context";
import { instrumentAstroResponse } from "./responseInstrumentation.ts";

/**
 * Dev-only response instrumentation middleware (ADR-0011).
 *
 * Registered through `addMiddleware({ order: "pre" })`, this runs inside
 * Astro's own middleware chain — before user middleware, around page
 * rendering. It buffers the rendered HTML response, adds the Design Tool
 * identity layer server-side (before any client script can strip Astro's
 * annotations), and forwards every non-HTML response untouched.
 *
 * Identity diagnostics are logged rather than swallowed so degraded identity
 * (for example a disabled dev toolbar) is observable in the dev server output.
 */
export const onRequest = async (
  _context: unknown,
  next: () => Promise<Response>,
): Promise<Response> => {
  const response = await next();
  const result = await instrumentAstroResponse(
    response,
    projectRoot === "" ? undefined : projectRoot,
  );
  for (const diagnostic of result.diagnostics) {
    console.warn(
      `[design-tool] ${diagnostic.code}: ${diagnostic.message}`,
    );
  }
  return result.response;
};
