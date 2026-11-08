import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { IconArrowsMaximize, IconArrowLeft, IconArrowRight, IconBoltFilled, IconCopy, IconTrash, IconUnlink } from "@tabler/icons-react";
import type { CanvasCard } from "./canvasStore.ts";
import { contentSourceUrl, flowStateOf, iterationId } from "./frameContent.ts";
import { resolveFrameUrl } from "./appRoute.ts";
import { stepFrameHistory, visitFrameUrl, type FrameHistory } from "./frameHistory.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

export interface CanvasCardHeaderProps {
  readonly card: CanvasCard;
  readonly label: string;
  readonly canRemove: boolean;
  readonly iterationBusy: boolean;
  readonly iterationDisabled: boolean;
  readonly iterationError: string | null;
  readonly onShowFocus?: () => void;
  readonly onDuplicate?: () => void;
  readonly onCreateIteration?: () => void;
  readonly onRemove: () => void;
  readonly onNavigate: (href: string) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function framePath(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function fullFrameUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

export function CanvasCardHeader({
  card,
  label,
  canRemove,
  iterationBusy,
  iterationDisabled,
  iterationError,
  onShowFocus,
  onDuplicate,
  onCreateIteration,
  onRemove,
  onNavigate,
  onPointerDown,
}: CanvasCardHeaderProps): ReactElement {
  const iteration = iterationId(card.content) !== undefined;
  // A flow frame is named by its state; several states usually share one URL.
  const currentUrl = iteration || flowStateOf(card.content) ? null : contentSourceUrl(card.content);
  const [draft, setDraft] = useState(() => currentUrl ? framePath(currentUrl) : "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const editing = useRef(false);
  const skipBlurCommit = useRef(false);
  const urlInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<FrameHistory | null>(() => currentUrl ? visitFrameUrl(null, currentUrl) : null);
  const traversingTo = useRef<string | null>(null);

  useEffect(() => {
    if (!editing.current && currentUrl) setDraft(framePath(currentUrl));
  }, [currentUrl]);

  useEffect(() => {
    if (!currentUrl) return;
    const traversal = traversingTo.current;
    traversingTo.current = null;
    // Arriving where Back or Forward was headed is not a new visit.
    if (traversal === currentUrl) return;
    setHistory((current) => visitFrameUrl(current, currentUrl));
  }, [currentUrl]);

  function traverse(delta: -1 | 1): void {
    const next = stepFrameHistory(history, delta);
    if (!next) return;
    const target = next.entries[next.index];
    if (target === undefined) return;
    traversingTo.current = target;
    setHistory(next);
    onNavigate(target);
  }

  useLayoutEffect(() => {
    if (editingUrl) urlInput.current?.select();
  }, [editingUrl]);

  function commitUrl(revertInvalid: boolean): boolean {
    if (!currentUrl) return true;
    const resolved = resolveFrameUrl(draft, window.location.origin);
    if (resolved.error !== null) {
      setUrlError(resolved.error);
      if (revertInvalid) {
        setDraft(framePath(currentUrl));
        setUrlError(null);
      }
      return false;
    }
    setUrlError(null);
    const next = framePath(resolved.href);
    setDraft(next);
    if (resolved.href !== currentUrl) onNavigate(resolved.href);
    return true;
  }

  return (
    <div className="canvas-card__header" data-kind={iteration ? "iteration" : "route"}>
      <div
        className="canvas-card__bar"
        role="toolbar"
        aria-label="Frame actions"
        aria-busy={iterationBusy || undefined}
        onPointerDown={onPointerDown}
        onDoubleClick={(event) => {
          // SAFETY: double-click targets inside the header are HTMLElements in this DOM context.
          const target = event.target as HTMLElement;
          if (!onShowFocus || target.closest("button, input, a, select, textarea, [contenteditable='true']")) return;
          onShowFocus();
        }}
      >
        <div className="canvas-card__start">
          {onShowFocus ? (
            <Tooltip content="Open this frame in focus view">
              <IconButton variant="quiet" label="Focus" data-test={`canvas-card-focus-${card.id}`} onClick={onShowFocus}>
                <IconArrowsMaximize size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>

        <div className="canvas-card__center">
          {currentUrl ? (
            <>
              <div className="canvas-card__url-lead">
                <Tooltip content="Back">
                  <IconButton variant="quiet" size="compact" label="Back" data-test={`canvas-card-back-${card.id}`}
                    disabled={!stepFrameHistory(history, -1)} onClick={() => traverse(-1)}>
                    <IconArrowLeft size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Forward">
                  <IconButton variant="quiet" size="compact" label="Forward" data-test={`canvas-card-forward-${card.id}`}
                    disabled={!stepFrameHistory(history, 1)} onClick={() => traverse(1)}>
                    <IconArrowRight size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                  </IconButton>
                </Tooltip>
                <span className="canvas-card__live" data-test={`canvas-card-drag-${card.id}`} title="Live view">
                  <IconBoltFilled size={12} aria-hidden="true" />
                </span>
              </div>
              <TextInput
                ref={urlInput}
                compact
                className="canvas-card__url"
                aria-label="Frame URL"
                aria-invalid={urlError ? true : undefined}
                data-invalid={urlError ? "true" : undefined}
                data-test={`canvas-card-url-${card.id}`}
                title={urlError ?? currentUrl}
                value={draft}
                autoComplete="off"
                spellCheck={false}
                onFocus={() => {
                  editing.current = true;
                  setUrlError(null);
                  setDraft(fullFrameUrl(currentUrl));
                  setEditingUrl(true);
                }}
                onBlur={() => {
                  editing.current = false;
                  setEditingUrl(false);
                  if (skipBlurCommit.current) {
                    skipBlurCommit.current = false;
                    return;
                  }
                  commitUrl(true);
                }}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (commitUrl(false)) {
                      skipBlurCommit.current = true;
                      event.currentTarget.blur();
                    }
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setDraft(framePath(currentUrl));
                    setUrlError(null);
                    skipBlurCommit.current = true;
                    event.currentTarget.blur();
                  }
                }}
              />
            </>
          ) : (
            <span className="canvas-card__url-space">
              <span className="canvas-card__title canvas-card__dimensions" data-test={`canvas-card-drag-${card.id}`} title={label}>{label}</span>
            </span>
          )}
          {onCreateIteration ? (
            <div className="canvas-card__url-trail">
              <Tooltip content="Unlink to HTML frame for iteration">
                <IconButton
                  variant="quiet"
                  size="compact"
                  label={iterationBusy ? "Creating unlinked frame" : "Create unlinked frame"}
                  data-test={`canvas-card-create-iteration-${card.id}`}
                  disabled={iterationBusy || iterationDisabled}
                  onClick={onCreateIteration}
                >
                  <IconUnlink size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </div>
          ) : null}
        </div>

        <div className="canvas-card__actions">
          {onDuplicate && !iteration ? (
            <Tooltip content="Duplicate">
              <IconButton variant="quiet" className="canvas-card__action-icon" label="Duplicate" data-test={`canvas-card-duplicate-${card.id}`} onClick={onDuplicate}>
                <IconCopy aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
          <IconButton
            variant="quiet"
            className="canvas-card__action-icon canvas-card__delete"
            label="Delete frame"
            data-test={`canvas-card-delete-${card.id}`}
            disabled={!canRemove}
            onClick={onRemove}
          >
            <IconTrash aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {iterationError ? <span className="canvas-card__iteration-error" role="status">{iterationError}</span> : null}
    </div>
  );
}
