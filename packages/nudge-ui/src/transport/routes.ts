/**
 * The reserved URL namespace every host serves the inspector through.
 *
 * Each host registers these routes with its own middleware and owns its own
 * reload policy, but the paths themselves are one contract: the browser client
 * is built once and requests the same URLs regardless of which host answers.
 */

/** Root of the reserved namespace. A host must not serve project files here. */
export const NUDGE_UI_ROUTE_PREFIX = "/__nudge_ui__/";

/** The runtime manifest describing this project to the client. */
export const NUDGE_UI_MANIFEST_PATH = `${NUDGE_UI_ROUTE_PREFIX}manifest`;

/** The prebundled, self-contained inspector client. */
export const NUDGE_UI_CLIENT_PATH = `${NUDGE_UI_ROUTE_PREFIX}client.mjs`;

/** Server-sent event stream announcing settled project changes. */
export const NUDGE_UI_RELOAD_PATH = `${NUDGE_UI_ROUTE_PREFIX}reload`;

/** The single element ID the inspector mounts into. */
export const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

/** True when a request path belongs to Nudge UI rather than the project. */
export function isReservedNudgeUiRoute(pathname: string): boolean {
  return pathname === NUDGE_UI_ROUTE_PREFIX.slice(0, -1)
    || pathname.startsWith(NUDGE_UI_ROUTE_PREFIX);
}
