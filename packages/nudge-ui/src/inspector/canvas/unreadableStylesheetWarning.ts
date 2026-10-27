import { unreadableStylesheetHosts } from "../tokens/resolution/crossOriginStylesheets.ts";
import { showToast, type ShowToastOptions } from "../ui/Toast.tsx";

/** Documents already warned about, so reopening the Animation tool does not repeat the toast. */
const warnedDocuments = new WeakSet<Document>();

/** One line: the toast only appears in the Animation tool, which already says what the styles are for. */
export function unreadableStylesheetMessage(hosts: readonly string[]): string {
  const others = hosts.length - 1;
  return `Can't read styles from ${hosts[0]}${others > 0 ? ` +${others}` : ""}`;
}

/** Warns once per document when its stylesheets cannot be read, since the animation scan finds motion through them. Returns a cancel for an unmount before the check settles. */
export function warnAboutUnreadableStylesheets(
  doc: Document,
  notify: (options: ShowToastOptions) => void = showToast,
): () => void {
  if (warnedDocuments.has(doc)) return () => undefined;
  let cancelled = false;
  void unreadableStylesheetHosts(doc).then((hosts) => {
    if (cancelled || hosts.length === 0 || warnedDocuments.has(doc)) return;
    warnedDocuments.add(doc);
    notify({ tone: "warning", title: unreadableStylesheetMessage(hosts) });
  });
  return () => {
    cancelled = true;
  };
}
