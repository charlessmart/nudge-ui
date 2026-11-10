import { useEffect, useState, type ReactElement } from "react";
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
import { AgentAvatars } from "./AgentAvatars.tsx";

/** Heads an add menu: one line on what the agent does, and the prompt that asks it to. */
export function AddMenuIntro({ text, copyTestId, onCopy }: {
  readonly text: string;
  readonly copyTestId: string;
  readonly onCopy: () => void;
}): ReactElement {
  return (
    <div className="add-menu-intro">
      <AgentAvatars />
      <p>{text}</p>
      <Button variant="secondary" type="button" data-test={copyTestId} onClick={onCopy}>
        <IconCopy size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        Copy prompt
      </Button>
    </div>
  );
}

/** Lists the unlinked HTML frames saved under `.nudge/artifacts` that are not yet on the Canvas; choosing one places it there. */
export function AddPageMenu(): ReactElement {
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
    const card = addCanvasArtifact(artifact);
    setOpen(false);
    revealCanvasCard(card.id);
  }

  async function copyAgentInstructions(): Promise<void> {
    try {
      await copyToClipboard(artifactAgentInstructions(window.location.origin));
      showToast({ title: "Prompt copied", description: "Paste it into your coding agent." });
    } catch {
      showToast({ tone: "error", title: "Could not copy the prompt", description: "Allow clipboard access for this page, then try again." });
    }
  }

  // Frames already on the canvas have nothing left to add, so they are left out.
  const unplaced = artifacts?.filter((artifact) => !findCardByArtifactId(artifact.id)) ?? null;

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
          {/* Focus stays off the copy button, so opening the menu to pick a frame does not ring it. */}
          <BasePopover.Popup className="add-page-menu" aria-label="Add page" data-test="navigator-add-page-menu" initialFocus={false}>
            <AddMenuIntro
              text="Ask your agent to create HTML pages for design iteration"
              copyTestId="navigator-copy-agent-instructions"
              onCopy={() => void copyAgentInstructions()}
            />
            {unplaced === null ? (
              <p className="add-page-menu__muted" role="status">Reading unlinked frames…</p>
            ) : failed ? (
              <p className="add-page-menu__error" role="alert">Could not read .nudge/artifacts.</p>
            ) : unplaced.length === 0 ? null : (
              <div className="add-page-menu__list">
                {unplaced.map((artifact) => (
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
                  </button>
                ))}
              </div>
            )}
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
