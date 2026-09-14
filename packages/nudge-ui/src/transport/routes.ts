/**
 * The reserved URL namespace every host serves the inspector through. Hosts
 * own their own middleware and reload policy, but the paths are one contract:
 * the browser client is built once and requests the same URLs everywhere.
 */

/** A host must not serve project files here. */
export const NUDGE_UI_ROUTE_PREFIX = "/__nudge_ui__/";

export const NUDGE_UI_MANIFEST_PATH = `${NUDGE_UI_ROUTE_PREFIX}manifest`;
export const NUDGE_UI_CLIENT_PATH = `${NUDGE_UI_ROUTE_PREFIX}client.mjs`;
/** Server-sent events announcing settled project changes. */
export const NUDGE_UI_RELOAD_PATH = `${NUDGE_UI_ROUTE_PREFIX}reload`;
export const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

export function isReservedNudgeUiRoute(pathname: string): boolean {
  return pathname === NUDGE_UI_ROUTE_PREFIX.slice(0, -1)
    || pathname.startsWith(NUDGE_UI_ROUTE_PREFIX);
}
