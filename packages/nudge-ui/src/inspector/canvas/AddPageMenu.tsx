import { useEffect, useState, type ReactElement } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconArtboard, IconCopy, IconPlus } from "@tabler/icons-react";
import { addCanvasArtifact, findCardByArtifactId } from "./canvasStore.ts";
import { listHtmlArtifacts } from "../iterations/client.ts";
import { artifactAgentInstructions } from "../iterations/agentInstructions.ts";
import type { HtmlArtifactMetadata } from "../../transport/artifacts.ts";
import { Button } from "../ui/Button.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { showToast } from "../ui/Toast.tsx";

export interface AddPageMenuProps {
  /** Selects and reveals the frame that was added or already showing the page. */
  readonly onAdded: (cardId: string) => void;
}

/** Adds an existing HTML iteration to the Canvas. */
export function AddPageMenu({ onAdded }: AddPageMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<HtmlArtifactMetadata[] | null>(null);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setArtifacts(null);
    setArtifactsError(null);
    void listHtmlArtifacts()
      .then((listed) => { if (active) setArtifacts(listed); })
      .catch(() => {
        if (!active) return;
        setArtifacts([]);
        setArtifactsError("Could not read .nudge/artifacts.");
      });
    return () => { active = false; };
  }, [open]);

  function addArtifact(artifact: HtmlArtifactMetadata): void {
    const card = addCanvasArtifact(artifact);
    setOpen(false);
    onAdded(card.id);
  }

  async function copyAgentInstructions(): Promise<void> {
    try {
      await copyToClipboard(artifactAgentInstructions(window.location.origin));
      showToast({
        title: "Agent instructions copied",
        description: "Paste them into your coding agent.",
      });
    } catch {
      showToast({ tone: "error", title: "Could not copy the agent instructions" });
    }
  }

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      <BasePopover.Trigger
        render={
          <Button
            variant="secondary"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-test="canvas-add-page"
          />
        }
      >
        <IconPlus size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        <span>Add page</span>
      </BasePopover.Trigger>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner className="add-page-menu__positioner" side="bottom" align="start" sideOffset={6}>
          <BasePopover.Popup className="add-page-menu" aria-label="Add page" data-test="canvas-add-page-menu">
            {artifacts === null ? (
              <p className="add-page-menu__muted" role="status">Reading iterations…</p>
            ) : artifactsError !== null ? (
              <p className="add-page-menu__error" role="alert">{artifactsError}</p>
            ) : artifacts.length === 0 ? (
              <p className="add-page-menu__muted">No HTML iterations found.</p>
            ) : (
              <div className="add-page-menu__list">
                {artifacts.map((artifact) => {
                  const onCanvas = findCardByArtifactId(artifact.id) !== undefined;
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      className="add-page-menu__item"
                      data-test={`canvas-add-iteration-${artifact.id}`}
                      onClick={() => addArtifact(artifact)}
                    >
                      <IconArtboard size={16} stroke="var(--icon-stroke-width)" aria-hidden="true" />
                      <span className="add-page-menu__item-content">
                        <span className="add-page-menu__item-title">{artifact.title || "Untitled iteration"}</span>
                        <span className="add-page-menu__item-detail">
                          {routeLabel(artifact.sourceUrl)} · {capturedLabel(artifact.capturedAt)}
                        </span>
                      </span>
                      {onCanvas ? <span className="add-page-menu__badge">On canvas</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="add-page-menu__footer">
              <Button variant="quiet" type="button" data-test="canvas-copy-agent-instructions" onClick={() => void copyAgentInstructions()}>
                <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                Copy agent instructions
              </Button>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

function routeLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function capturedLabel(capturedAt: number): string {
  return new Date(capturedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
