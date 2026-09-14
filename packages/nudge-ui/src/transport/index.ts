/**
 * The wire contract between any host and the browser client.
 *
 * This module must stay browser-safe: the inspector's mount components import
 * these routes directly. Anything needing Node belongs in `project/` instead.
 */
export * from "./routes.ts";

/** Envelope version understood by the browser client. */
export const NUDGE_UI_MANIFEST_VERSION = 1;
