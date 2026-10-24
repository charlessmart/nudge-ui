import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { IconArtboard, IconCopy, IconGripVertical, IconPlayerPlay, IconX } from "@tabler/icons-react";
import type { CanvasCard } from "./canvasStore.ts";
import { contentSourceUrl, iterationId } from "./frameContent.ts";
import { resolveFrameUrl } from "./appRoute.ts";
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

function displayUrl(url: string): string {
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
  const currentUrl = iteration ? null : contentSourceUrl(card.content);
  const [draft, setDraft] = useState(() => currentUrl ? displayUrl(currentUrl) : "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const editing = useRef(false);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (!editing.current && currentUrl) setDraft(displayUrl(currentUrl));
  }, [currentUrl]);

  function commitUrl(revertInvalid: boolean): boolean {
    if (!currentUrl) return true;
    const resolved = resolveFrameUrl(draft, window.location.origin);
    if (resolved.error !== null) {
      setUrlError(resolved.error);
      if (revertInvalid) {
        setDraft(displayUrl(currentUrl));
        setUrlError(null);
      }
      return false;
    }
    setUrlError(null);
    const next = displayUrl(resolved.href);
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
      >
        <Tooltip content={canRemove ? "Delete frame" : "Keep at least one frame on the canvas"} stableTrigger>
          <button
            type="button"
            className="canvas-card__close"
            aria-label="Delete frame"
            data-test={`canvas-card-delete-${card.id}`}
            disabled={!canRemove}
            onClick={onRemove}
          >
            <IconX size={14} stroke="var(--icon-stroke-width)" aria-hidden="true" />
          </button>
        </Tooltip>

        <span className="canvas-card__grip" data-test={`canvas-card-drag-${card.id}`} title="Drag frame">
          <IconGripVertical size={14} stroke="var(--icon-stroke-width)" aria-hidden="true" />
        </span>

        {onShowFocus ? (
          <Tooltip content="Open this frame in focus view">
            <IconButton variant="quiet" label="Focus" data-test={`canvas-card-focus-${card.id}`} onClick={onShowFocus}>
              <IconPlayerPlay aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ) : null}

        {currentUrl ? (
          <TextInput
            className="canvas-card__url"
            aria-label="Frame URL"
            aria-invalid={urlError ? true : undefined}
            data-invalid={urlError ? "true" : undefined}
            data-test={`canvas-card-url-${card.id}`}
            title={urlError ?? undefined}
            value={draft}
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => {
              editing.current = true;
              setUrlError(null);
              event.currentTarget.select();
            }}
            onBlur={() => {
              editing.current = false;
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
                setDraft(displayUrl(currentUrl));
                setUrlError(null);
                skipBlurCommit.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="canvas-card__url-space">
            <span className="canvas-card__title canvas-card__dimensions" data-test={`canvas-card-dimensions-${card.id}`}>{label}</span>
          </span>
        )}

        <div className="canvas-card__actions">
          {onDuplicate && !iteration ? (
            <Tooltip content="Create a linked copy of this frame">
              <IconButton variant="quiet" label="Duplicate" data-test={`canvas-card-duplicate-${card.id}`} onClick={onDuplicate}>
                <IconCopy aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
          {onCreateIteration ? (
            <Tooltip content="Create an unlinked HTML version">
              <IconButton
                variant="quiet"
                label="Create HTML iteration"
                data-test={`canvas-card-create-iteration-${card.id}`}
                disabled={iterationBusy || iterationDisabled}
                onClick={onCreateIteration}
              >
                <IconArtboard aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {iterationError ? <span className="canvas-card__iteration-error" role="status">{iterationError}</span> : null}
    </div>
  );
}
