import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconAlertTriangle, IconCheck, IconTrash } from "@tabler/icons-react";
import { useCanvasMode } from "../canvas/viewStore.ts";
import { getRegisteredFrames } from "../canvas/projection.ts";
import { subscribeCanvasRendererMessages } from "../canvas/rendererMessageRouter.ts";
import { measureFrameViewport, toViewportPoint } from "../canvas/frameConnection.ts";
import { canvasFrameElement, type CanvasFrame } from "../canvas/canvasFrame.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import { captureRenderedInstance } from "../projection/renderedInstance.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { commentFingerprint, commentViewport, resolveCommentElement } from "./element.ts";
import { commentRoute, getCommentClearRevision, isCommentToolActive, removeComment, saveComment, subscribeComments, useComments, useCommentToolActive, type ElementComment } from "./store.ts";
import { isReadingCommentSource, readCommentSource, reconcileComments } from "./verification.ts";
import styles from "./CommentsOverlay.css?inline";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";

interface Draft {
  readonly element: HTMLElement;
  readonly iframe: CanvasFrame;
  readonly existing?: ElementComment;
}

interface Anchor { readonly left: number; readonly top: number }

interface Observation {
  readonly observer: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
  checking: boolean;
  /** A source signal arrived mid-check, which that check may not have read. */
  pending: boolean;
  interval: number;
  lastCheckEndedAt: number;
}

const CHECK_DELAY_MS = 450;
const MAX_CHECK_DELAY_MS = 8_000;

function sameAnchor(left: Anchor | null | undefined, right: Anchor | null | undefined): boolean {
  return left?.left === right?.left && left?.top === right?.top;
}

function anchorFor(iframe: CanvasFrame, element: HTMLElement): Anchor | null {
  if (!element.isConnected || iframe.contentDocument !== element.ownerDocument) return null;
  // Focus view keeps real frames mounted, but their pins must stay hidden.
  const frameElement = canvasFrameElement(iframe);
  if (frameElement && getElementComputedStyle(frameElement).visibility !== "visible") return null;
  const frame = measureFrameViewport(iframe);
  const rect = element.getBoundingClientRect();
  const { x: left, y: top } = toViewportPoint(frame, { x: rect.right, y: rect.top });
  if (top < frame.top || top > frame.top + frame.height || left < frame.left || left > frame.left + frame.width) return null;
  return { left, top };
}

const EDITOR_MARGIN = 8;
/** Gap between the commented element's edge and the editor. */
const EDITOR_OFFSET = 12;

/** Window space the open inspector panel takes from each side, in pixels. */
function panelReserve(): { start: number; end: number } {
  const container = portalContainer();
  if (!container) return { start: 0, end: 0 };
  const probes = (["start", "end"] as const).map((side) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:0;width:var(--panel-reserve-${side},0px)`;
    container.append(probe);
    return probe;
  });
  const [start = 0, end = 0] = probes.map((probe) => probe.getBoundingClientRect().width);
  for (const probe of probes) probe.remove();
  return { start, end };
}

/** The window minus the panel, so the editor flips or shifts away from the page edge and the panel instead of sliding under it. */
function editorBoundary(): { x: number; y: number; width: number; height: number } {
  const { start, end } = panelReserve();
  return { x: start, y: 0, width: Math.max(0, window.innerWidth - start - end), height: window.innerHeight };
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
  const bindings = useRef(new Map<string, { element: HTMLElement; iframe: CanvasFrame }>());
  const observations = useRef(new Map<Document, Observation>());

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

  useEffect(() => subscribeCanvasRendererMessages(({ frame, message }) => {
    if (message.type === "element-click" && isCommentToolActive()) {
      const element = frame.element(message);
      if (element) openDraft({ element, iframe: frame.iframe });
    }
    if (message.type === "element-deselect") setDraft(null);
    const frameDocument = frame.document();
    if (message.type === "frame-ready" && frameDocument) {
      void reconcileComments(frameDocument).catch(() => undefined);
    }
  }), []);

  useEffect(() => {
    if (comments.length === 0 && !draft) {
      setAnchors(new Map());
      setDraftAnchor(null);
      bindings.current.clear();
      return;
    }
    let animationFrame = 0;
    let previousAnchors: ReadonlyMap<string, Anchor> | null = null;
    let previousDraftAnchor: Anchor | null | undefined;
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
      if (!previousAnchors || previousAnchors.size !== next.size
        || [...next].some(([key, anchor]) => !sameAnchor(previousAnchors?.get(key), anchor))) {
        previousAnchors = next;
        setAnchors(next);
      }
      const current = draftRef.current;
      const nextDraftAnchor = current ? anchorFor(current.iframe, current.element) : null;
      if (previousDraftAnchor === undefined || !sameAnchor(previousDraftAnchor, nextDraftAnchor)) {
        previousDraftAnchor = nextDraftAnchor;
        setDraftAnchor(nextDraftAnchor);
      }
      if (current && (!current.element.isConnected || current.iframe.contentDocument !== current.element.ownerDocument)) setDraft(null);
      animationFrame = requestAnimationFrame(refresh);
    };
    refresh();
    return () => cancelAnimationFrame(animationFrame);
  }, [comments, draft]);

  useEffect(() => {
    if (!comments.some((comment) => comment.handedOff)) return;
    // A check briefly removes every preview, so checks that resolve nothing back off to avoid flashing on continuously mutating pages.
    const run = (doc: Document, observation: Observation): void => {
      observation.timer = null;
      if (observation.checking) return;
      observation.checking = true;
      void reconcileComments(doc).then((removed) => {
        observation.interval = removed > 0 ? CHECK_DELAY_MS : Math.min(observation.interval * 2, MAX_CHECK_DELAY_MS);
      }, () => undefined).finally(() => {
        observation.lastCheckEndedAt = Date.now();
        setTimeout(() => {
          observation.checking = false;
          if (!observation.pending || observations.current.get(doc) !== observation) return;
          observation.pending = false;
          schedule(doc, observation);
        }, 0);
      });
    };
    const schedule = (doc: Document, observation: Observation): void => {
      if (observation.checking) {
        observation.pending = true;
        return;
      }
      if (observation.timer !== null) return;
      // Let the change that triggered this settle, and keep the backoff interval.
      observation.timer = setTimeout(() => run(doc, observation),
        Math.max(CHECK_DELAY_MS, observation.lastCheckEndedAt + observation.interval - Date.now()));
    };
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
        const observation: Observation = { observer: new MutationObserver((records) => {
          if (isReadingCommentSource(doc)) return;
          const sourceChanged = records.some((record) => {
            const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
            if (element?.closest('[data-nudge-ui], #nudge-ui-root')) return false;
            if (record.type === "attributes" && (record.attributeName?.startsWith("data-nudge") || record.attributeName?.startsWith("data-projection") || record.attributeName === "data-renderer-id")) return false;
            return true;
          });
          if (sourceChanged) schedule(doc, observation);
        }), timer: null, checking: false, pending: false, interval: CHECK_DELAY_MS, lastCheckEndedAt: -Infinity };
        observation.observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
        observations.current.set(doc, observation);
        run(doc, observation);
      }
    };
    // Returning to the page is when an agent's source edit is most likely to have landed.
    const returned = (): void => {
      for (const [doc, observation] of observations.current) {
        observation.interval = CHECK_DELAY_MS;
        observation.lastCheckEndedAt = -Infinity;
        if (observation.timer) clearTimeout(observation.timer);
        observation.timer = null;
        schedule(doc, observation);
      }
    };
    refresh();
    const timer = setInterval(refresh, 500);
    window.addEventListener("focus", returned);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", returned);
      for (const observation of observations.current.values()) {
        observation.observer.disconnect();
        if (observation.timer) clearTimeout(observation.timer);
      }
      observations.current.clear();
    };
  }, [comments]);

  const editing = draft !== null && draftAnchor !== null;
  const [boundary, setBoundary] = useState(editorBoundary);
  useEffect(() => {
    if (!editing) return;
    const measure = (): void => setBoundary(editorBoundary());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [editing]);
  const anchorLeft = draftAnchor?.left ?? 0;
  const anchorTop = draftAnchor?.top ?? 0;
  const editorAnchor = useMemo(() => ({
    getBoundingClientRect: () => new DOMRect(anchorLeft, anchorTop, 0, 0),
  }), [anchorLeft, anchorTop]);

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
        setError("Element changed, try again or refresh the page.");
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
    <InspectorStyle css={styles} />
    {comments.flatMap((comment) => [...anchors].filter(([key]) => key.startsWith(`${comment.id}:`)).map(([key, anchor]) => (
      <button key={key} type="button" className="comment-pin" data-test="comment-pin" aria-label={`Comment: ${comment.note}`}
        style={anchor} onClick={() => {
          const bound = bindings.current.get(key);
          if (bound) openDraft({ ...bound, existing: comment });
        }}>
        <span className="comment-pin__reveal" aria-hidden="true">
          <span className="comment-pin__clip"><span className="comment-pin__note">{comment.note}</span></span>
        </span>
      </button>
    )))}
    {draft && draftAnchor ? <div className="comment-editor-backdrop" aria-hidden="true" onClick={() => setDraft(null)} /> : null}
    {draft && draftAnchor ? <BasePopover.Root open onOpenChange={(open) => { if (!open) setDraft(null); }}>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner className="comment-editor__positioner" anchor={editorAnchor} side="right" align="start"
          sideOffset={EDITOR_OFFSET} collisionBoundary={boundary} collisionPadding={EDITOR_MARGIN}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}>
          <BasePopover.Popup className="comment-editor" data-test="comment-editor" aria-label="Element comment" initialFocus={false}
            render={<form onSubmit={(event) => { event.preventDefault(); void confirm(); }} />}>
            {error ? <div className="comment-editor__banner" role="alert">
              <IconAlertTriangle size={14} aria-hidden="true" />
              <span>{error}</span>
            </div> : null}
            <TextInput appearance="embedded" autoFocus aria-label="Comment" data-test="comment-input" placeholder="Leave a comment" maxLength={2000}
              value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} />
            <IconButton label="Confirm comment" variant="primary" type="submit" disabled={saving || !note.trim()} data-test="comment-confirm"><IconCheck size={18} /></IconButton>
            {draft.existing ? <IconButton label="Delete comment" variant="quiet" disabled={saving} onClick={() => {
              removeComment(draft.existing!.id); setDraft(null);
            }}><IconTrash size={16} /></IconButton> : null}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root> : null}
  </>;
}
