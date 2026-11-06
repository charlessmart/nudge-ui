import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconArtboard, IconCopy, IconPlus } from "@tabler/icons-react";
import { addCanvasArtifact, findCardByArtifactId, revealCanvasCard } from "../canvas/canvasStore.ts";
import { listHtmlArtifacts } from "../iterations/client.ts";
import { artifactAgentInstructions } from "../iterations/agentInstructions.ts";
import type { HtmlArtifactMetadata } from "../../transport/artifacts.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { showToast } from "../ui/Toast.tsx";

/** Lists the unlinked HTML frames saved under `.nudge/artifacts`; choosing one places it on the Canvas. `footer` adds actions beside the agent instructions. */
export function AddPageMenu({ footer }: { readonly footer?: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<HtmlArtifactMetadata[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Scans on every open, so files an agent wrote since show up without a reload.
    if (!open) return;
    let active = true;
    setArtifacts(null);
    setFailed(false);
    void listHtmlArtifacts()
      .then((listed) => { if (active) setArtifacts(listed); })
      .catch(() => {
        if (!active) return;
        setArtifacts([]);
        setFailed(true);
      });
    return () => { active = false; };
  }, [open]);

  function add(artifact: HtmlArtifactMetadata): void {
    const card = findCardByArtifactId(artifact.id) ?? addCanvasArtifact(artifact);
    setOpen(false);
    revealCanvasCard(card.id);
  }

  async function copyAgentInstructions(): Promise<void> {
    try {
      await copyToClipboard(artifactAgentInstructions(window.location.origin));
      showToast({ title: "Instructions copied", description: "Paste them into your coding agent." });
    } catch {
      showToast({ tone: "error", title: "Couldn't copy the instructions", description: "Allow clipboard access for this page, then try again." });
    }
  }

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      {/* Stays mounted while the menu is open: swapping the tooltip's wrapper away would remount the trigger the popover anchors to. */}
      <Tooltip content="Add page" stableTrigger>
        <BasePopover.Trigger
          render={
            <IconButton
              variant="quiet"
              size="compact"
              label="Add page"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-test="navigator-add-page"
            />
          }
        >
          <IconPlus size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        </BasePopover.Trigger>
      </Tooltip>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner className="add-page-menu__positioner" side="bottom" align="start" sideOffset={6}>
          {/* Focus would otherwise land on the footer button while the list is still loading, scrolling the menu to its end. */}
          <BasePopover.Popup className="add-page-menu" aria-label="Add page" data-test="navigator-add-page-menu" initialFocus={false}>
            {artifacts === null ? (
              <p className="add-page-menu__muted" role="status">Reading unlinked frames…</p>
            ) : failed ? (
              <p className="add-page-menu__error" role="alert">Could not read .nudge/artifacts.</p>
            ) : artifacts.length === 0 ? (
              <p className="add-page-menu__muted">No unlinked frames found.</p>
            ) : (
              <div className="add-page-menu__list">
                {artifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    className="add-page-menu__item"
                    data-test={`navigator-iteration-${artifact.id}`}
                    onClick={() => add(artifact)}
                  >
                    <IconArtboard size={16} stroke="var(--icon-stroke-width)" aria-hidden="true" />
                    <span className="add-page-menu__item-content">
                      <span className="add-page-menu__item-title">{artifact.title || "Untitled frame"}</span>
                      <span className="add-page-menu__item-detail">
                        {routeLabel(artifact.sourceUrl)} · {capturedLabel(artifact.capturedAt)}
                      </span>
                    </span>
                    {findCardByArtifactId(artifact.id) ? <span className="add-page-menu__badge">On canvas</span> : null}
                  </button>
                ))}
              </div>
            )}
            <div className="add-page-menu__footer">
              <Button variant="quiet" size="compact" type="button" data-test="navigator-copy-agent-instructions" onClick={() => void copyAgentInstructions()}>
                <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                Copy agent instructions
              </Button>
              {footer}
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
