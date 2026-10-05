import { useEffect, useRef, useState, type ReactElement } from "react";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import { useCanvasMode } from "../canvas/viewStore.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { subscribeCanvasRendererMessages } from "../canvas/rendererMessageRouter.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "../canvas/rendererCidIndex.ts";
import { captureRenderedInstance } from "../projection/renderedInstance.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { commentFingerprint, commentViewport, resolveCommentElement } from "./element.ts";
import { commentRoute, getCommentClearRevision, isCommentToolActive, removeComment, saveComment, subscribeComments, useComments, useCommentToolActive, type ElementComment } from "./store.ts";
import { isReadingCommentSource, readCommentSource, reconcileComments } from "./verification.ts";
import styles from "./CommentsOverlay.css?inline";

interface Draft {
  readonly element: HTMLElement;
  readonly iframe: HTMLIFrameElement;
  readonly existing?: ElementComment;
}

interface Anchor { readonly left: number; readonly top: number }

function anchorFor(iframe: HTMLIFrameElement, element: HTMLElement): Anchor | null {
  if (!element.isConnected || iframe.contentDocument !== element.ownerDocument) return null;
  const frame = iframe.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const scale = frame.width / (iframe.clientWidth || frame.width);
  const left = frame.left + rect.right * scale;
  const top = frame.top + rect.top * scale;
  if (top < frame.top || top > frame.bottom || left < frame.left || left > frame.right) return null;
  return { left, top };
}

export function CommentsOverlay(): ReactElement | null {
  const mode = useCanvasMode();
  const comments = useComments();
  const commentActive = useCommentToolActive();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<ReadonlyMap<string, Anchor>>(new Map());
  const [draftAnchor, setDraftAnchor] = useState<Anchor | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const bindings = useRef(new Map<string, { element: HTMLElement; iframe: HTMLIFrameElement }>());
  const observations = useRef(new Map<Document, { observer: MutationObserver; timer: ReturnType<typeof setTimeout> | null }>());

  function openDraft(next: Draft): void {
    setDraft(next);
    setNote(next.existing?.note ?? "");
    setError(null);
  }

  useEffect(() => {
    if (!commentActive) setDraft(null);
  }, [commentActive]);

  useEffect(() => {
    let revision = getCommentClearRevision();
    return subscribeComments(() => {
      if (revision === getCommentClearRevision()) return;
      revision = getCommentClearRevision();
      setDraft(null);
    });
  }, []);

  useEffect(() => {
    if (!draft) return;
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => window.removeEventListener("keydown", dismissOnEscape, true);
  }, [draft]);

  useEffect(() => subscribeCanvasRendererMessages(({ iframe, message }) => {
    if (message.type === "element-click" && isCommentToolActive()) {
      const element = iframe.contentDocument?.querySelector<HTMLElement>(`[${RENDERER_ELEMENT_ID_ATTR}="${message.elementId}"]`);
      if (element && element.getAttribute("data-cid") === message.cid && (element.getAttribute("data-src") ?? "") === message.src) {
        openDraft({ element, iframe });
      }
    }
    if (message.type === "element-deselect") setDraft(null);
    if (message.type === "frame-ready" && iframe.contentDocument) {
      void reconcileComments(iframe.contentDocument).catch(() => undefined);
    }
  }), []);

  useEffect(() => {
    if (comments.length === 0 && !draft) {
      setAnchors(new Map());
      setDraftAnchor(null);
      bindings.current.clear();
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (): void => {
      const next = new Map<string, Anchor>();
      const offsets = new Map<string, number>();
      for (const key of bindings.current.keys()) {
        if (!comments.some((comment) => key.startsWith(`${comment.id}:`))) bindings.current.delete(key);
      }
      for (const comment of comments) {
        for (const [cardId, iframe] of getRegisteredFrames()) {
          const doc = iframe.contentDocument;
          if (!doc || commentRoute(doc) !== comment.route) continue;
          const key = `${comment.id}:${cardId}`;
          const bound = bindings.current.get(key);
          const element = bound?.iframe === iframe && bound.element.isConnected && bound.element.ownerDocument === doc
            ? bound.element : resolveCommentElement(doc, comment.target);
          if (!element) continue;
          bindings.current.set(key, { element, iframe });
          const anchor = anchorFor(iframe, element);
          if (anchor) {
            const positionKey = `${cardId}:${anchor.left}:${anchor.top}`;
            const offset = offsets.get(positionKey) ?? 0;
            next.set(key, { ...anchor, top: anchor.top + offset });
            offsets.set(positionKey, offset + 30);
          }
        }
      }
      setAnchors(next);
      const current = draftRef.current;
      setDraftAnchor(current ? anchorFor(current.iframe, current.element) : null);
      if (current && (!current.element.isConnected || current.iframe.contentDocument !== current.element.ownerDocument)) setDraft(null);
      timer = setTimeout(refresh, 100);
    };
    refresh();
    return () => clearTimeout(timer);
  }, [comments, draft]);

  useEffect(() => {
    if (!comments.some((comment) => comment.handedOff)) return;
    const refresh = (): void => {
      const documents = new Set([...getRegisteredFrames()].map(([, iframe]) => iframe.contentDocument).filter((doc) => doc !== null));
      for (const [doc, observation] of observations.current) {
        if (documents.has(doc)) continue;
        observation.observer.disconnect();
        if (observation.timer) clearTimeout(observation.timer);
        observations.current.delete(doc);
      }
      for (const doc of documents) {
        if (observations.current.has(doc) || !comments.some((item) => item.handedOff && item.route === commentRoute(doc))) continue;
        const observation = { observer: new MutationObserver((records) => {
          if (isReadingCommentSource(doc)) return;
          const sourceChanged = records.some((record) => {
            const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
            if (element?.closest('[data-nudge-ui], #nudge-ui-root')) return false;
            if (record.type === "attributes" && (record.attributeName?.startsWith("data-nudge") || record.attributeName?.startsWith("data-projection") || record.attributeName === "data-renderer-id")) return false;
            return true;
          });
          if (!sourceChanged) return;
          if (observation.timer) clearTimeout(observation.timer);
          observation.timer = setTimeout(() => { void reconcileComments(doc).catch(() => undefined); }, 200);
        }), timer: null as ReturnType<typeof setTimeout> | null };
        observation.observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
        observations.current.set(doc, observation);
        void reconcileComments(doc).catch(() => undefined);
      }
    };
    refresh();
    const timer = setInterval(refresh, 500);
    return () => {
      clearInterval(timer);
      for (const observation of observations.current.values()) {
        observation.observer.disconnect();
        if (observation.timer) clearTimeout(observation.timer);
      }
      observations.current.clear();
    };
  }, [comments]);

  async function confirm(): Promise<void> {
    if (!draft || saving || !note.trim()) return;
    const currentDraft = draft;
    const clearRevision = getCommentClearRevision();
    const text = note.trim();
    setSaving(true);
    setError(null);
    try {
      const comment = await readCommentSource(draft.element.ownerDocument, () => {
        if (!draft.element.isConnected) return null;
        const target = captureRenderedInstance(draft.element);
        if (!target) return null;
        return {
          id: draft.existing?.id ?? crypto.randomUUID(),
          route: commentRoute(draft.element.ownerDocument),
          target,
          tag: draft.element.tagName.toLowerCase(),
          note: text,
          baseline: commentFingerprint(draft.element),
          viewport: commentViewport(draft.element.ownerDocument),
          handedOff: false,
        };
      });
      if (getCommentClearRevision() !== clearRevision) return;
      if (!comment) {
        setError("The element changed. Select it again to save your comment.");
        return;
      }
      saveComment(comment);
      if (draftRef.current === currentDraft) setDraft(null);
    } catch {
      setError("Couldn't save this comment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (mode !== "canvas") return null;
  return <>
    <style>{styles}</style>
    {comments.flatMap((comment) => [...anchors].filter(([key]) => key.startsWith(`${comment.id}:`)).map(([key, anchor]) => (
      <button key={key} type="button" className="comment-pin" data-test="comment-pin" aria-label={`Comment: ${comment.note}`}
        title={comment.note} style={anchor} onClick={() => {
          const bound = bindings.current.get(key);
          if (bound) openDraft({ ...bound, existing: comment });
        }} />
    )))}
    {draft && draftAnchor ? <div className="comment-editor-backdrop" aria-hidden="true" onClick={() => setDraft(null)} /> : null}
    {draft && draftAnchor ? <form className="comment-editor" data-test="comment-editor" role="dialog" aria-label="Element comment"
      style={{ left: Math.max(8, Math.min(draftAnchor.left + 12, window.innerWidth - 400)), top: Math.max(8, Math.min(draftAnchor.top, window.innerHeight - 90)) }}
      onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
      <TextInput appearance="embedded" autoFocus aria-label="Comment" data-test="comment-input" placeholder="Leave a comment" maxLength={2000}
        value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} />
      <IconButton label="Confirm comment" variant="primary" type="submit" disabled={saving || !note.trim()} data-test="comment-confirm"><IconCheck size={18} /></IconButton>
      {draft.existing ? <IconButton label="Delete comment" variant="quiet" disabled={saving} onClick={() => {
        removeComment(draft.existing!.id); setDraft(null);
      }}><IconTrash size={16} /></IconButton> : null}
      {error ? <span className="comment-editor__error" role="alert">{error}</span> : null}
    </form> : null}
  </>;
}
