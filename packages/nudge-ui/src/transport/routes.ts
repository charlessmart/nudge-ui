/** A host must not serve project files here. */
export const NUDGE_UI_ROUTE_PREFIX = "/__nudge_ui__/";

export const NUDGE_UI_MANIFEST_PATH = `${NUDGE_UI_ROUTE_PREFIX}manifest`;
export const NUDGE_UI_CLIENT_PATH = `${NUDGE_UI_ROUTE_PREFIX}client.mjs`;
/** Pure controller document that hosts the editor chrome. */
export const NUDGE_UI_EDITOR_PATH = `${NUDGE_UI_ROUTE_PREFIX}editor`;
/** Server-sent events announcing settled project changes. */
export const NUDGE_UI_RELOAD_PATH = `${NUDGE_UI_ROUTE_PREFIX}reload`;
/** Project-local HTML iterations created by unlinking a Canvas frame. */
export const NUDGE_UI_ARTIFACTS_PATH = `${NUDGE_UI_ROUTE_PREFIX}artifacts`;
/** Dev-only sticker sheet rendering one component; select it with `?component=<componentId>`. */
export const NUDGE_UI_COMPONENTS_PATH = `${NUDGE_UI_ROUTE_PREFIX}components`;
/** Which library components the user hid or restored, saved in the project as `.nudge/library.json` so it can be committed and shared. */
export const NUDGE_UI_LIBRARY_PATH = `${NUDGE_UI_ROUTE_PREFIX}library`;
/** Agent-written flows from `nudge/flows`, and the replay results the browser reports back. */
export const NUDGE_UI_FLOWS_PATH = `${NUDGE_UI_ROUTE_PREFIX}flows`;
export const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

/** Query marker that presents an application route through the editor shell. */
export const NUDGE_UI_EDITOR_QUERY_PARAM = "nudge-ui";
export const NUDGE_UI_EDITOR_QUERY_VALUE = "editor";

/** Public `nudge-ui` values that turn the inspector off or on for one browser tab. */
export const NUDGE_UI_OFF_QUERY_VALUE = "off";
export const NUDGE_UI_ON_QUERY_VALUE = "on";

/** Internal alias of `nudge-ui=off` kept for existing direct-view links. */
export const NUDGE_UI_DIRECT_QUERY_PARAM = "__nudge_ui_direct";

export function isReservedNudgeUiRoute(pathname: string): boolean {
  return pathname === NUDGE_UI_ROUTE_PREFIX.slice(0, -1)
    || pathname.startsWith(NUDGE_UI_ROUTE_PREFIX);
}
