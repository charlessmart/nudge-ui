import { projectRoot } from "virtual:nudge-ui-astro-context";
import { instrumentAstroResponse } from "./responseInstrumentation.ts";

/** Runs at `order: "pre"` so identity lands before any client script can strip Astro's annotations. */
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
      `[nudge-ui] ${diagnostic.code}: ${diagnostic.message}`,
    );
  }
  return result.response;
};
