import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { IconBoltFilled, IconCopy, IconShape, IconTrash } from "@tabler/icons-react";
import type { CanvasCard } from "./canvasStore.ts";
import { contentSourceUrl, iterationId } from "./frameContent.ts";
import { resolveFrameUrl } from "./appRoute.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { TextInput } from "../ui/TextInput.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { SelectPlayFilledIcon } from "./CanvasToolIcons.tsx";

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
  const currentUrl = iteration ? null : contentSourceUrl(card.content);
  const [draft, setDraft] = useState(() => currentUrl ? framePath(currentUrl) : "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const editing = useRef(false);
  const skipBlurCommit = useRef(false);
  const urlInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing.current && currentUrl) setDraft(framePath(currentUrl));
  }, [currentUrl]);

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
      >
        <div className="canvas-card__start">
          {onShowFocus ? (
            <Tooltip content="Open this frame in focus view">
              <IconButton variant="quiet" label="Focus" data-test={`canvas-card-focus-${card.id}`} onClick={onShowFocus}>
                <SelectPlayFilledIcon aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>

        <div className="canvas-card__center">
          {currentUrl ? (
            <>
              <span className="canvas-card__live" data-test={`canvas-card-drag-${card.id}`} title="Live view">
                <IconBoltFilled size={12} aria-hidden="true" />
              </span>
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
        </div>

        <div className="canvas-card__actions">
          {onCreateIteration ? (
            <Tooltip content="Create unlinked HTML version for design iteration">
              <Button
                variant="quiet"
                className="canvas-card__iteration-button"
                aria-label={iterationBusy ? "Creating iteration" : "Create HTML iteration"}
                data-test={`canvas-card-create-iteration-${card.id}`}
                disabled={iterationBusy || iterationDisabled}
                onClick={onCreateIteration}
              >
                <IconShape size={16} stroke="var(--icon-stroke-width)" aria-hidden="true" />
                <span className="canvas-card__iteration-label">{iterationBusy ? "Creating…" : "Iteration"}</span>
              </Button>
            </Tooltip>
          ) : null}
          {onDuplicate && !iteration ? (
            <Tooltip content="Create a linked copy of this frame">
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
