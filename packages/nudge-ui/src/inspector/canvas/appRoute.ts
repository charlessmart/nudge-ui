import {
  NUDGE_UI_DIRECT_QUERY_PARAM,
  NUDGE_UI_EDITOR_QUERY_PARAM,
  isReservedNudgeUiRoute,
} from "../../transport/routes.ts";

export type ResolvedFrameUrl =
  | { readonly href: string; readonly error: null }
  | { readonly href: null; readonly error: string };

/** Resolves a user-entered frame URL against the app's same-origin route rules. */
export function resolveFrameUrl(value: string, origin: string): ResolvedFrameUrl {
  const trimmed = value.trim();
  if (!trimmed) return { href: null, error: "Enter a route or URL." };
  let url: URL;
  try {
    url = new URL(trimmed, origin);
  } catch {
    return { href: null, error: "Enter a valid route or URL." };
  }
  if (url.origin !== origin) {
    return { href: null, error: "Only pages from this app can be added." };
  }
  if (isReservedNudgeUiRoute(url.pathname)) {
    return { href: null, error: "Nudge pages cannot be opened in a frame." };
  }
  url.hash = "";
  url.searchParams.delete(NUDGE_UI_EDITOR_QUERY_PARAM);
  url.searchParams.delete(NUDGE_UI_DIRECT_QUERY_PARAM);
  return { href: url.href, error: null };
}
