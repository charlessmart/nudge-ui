import { useEffect, useState, type ReactElement } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconArtboard, IconLink, IconPlus } from "@tabler/icons-react";
import { addCanvasArtifact, addCanvasCard, findCardByArtifactId, findCardByNormalizedUrl } from "./canvasStore.ts";
import { normalizeUrl } from "./normalizeUrl.ts";
import { listHtmlArtifacts } from "../iterations/client.ts";
import type { HtmlArtifactMetadata } from "../../transport/artifacts.ts";
import { NUDGE_UI_DIRECT_QUERY_PARAM, NUDGE_UI_EDITOR_QUERY_PARAM } from "../../transport/routes.ts";
import { Button } from "../ui/Button.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { portalContainer } from "../ui/portalContainer.ts";

export interface AddPageMenuProps {
  /** Selects and reveals the frame that was added or already showing the page. */
  readonly onAdded: (cardId: string) => void;
}

/** Adds an application route or an existing HTML iteration to the Canvas. */
export function AddPageMenu({ onAdded }: AddPageMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
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

  function resolveRoute(): { href: string; error: null } | { href: null; error: string } {
    const value = route.trim();
    if (!value) return { href: null, error: "Enter a route or URL." };
    let url: URL;
    try {
      url = new URL(value, window.location.origin);
    } catch {
      return { href: null, error: "Enter a valid route or URL." };
    }
    if (url.origin !== window.location.origin) {
      return { href: null, error: "Only pages from this app can be added." };
    }
    url.hash = "";
    // A frame must render the app, never another editor shell.
    url.searchParams.delete(NUDGE_UI_EDITOR_QUERY_PARAM);
    url.searchParams.delete(NUDGE_UI_DIRECT_QUERY_PARAM);
    return { href: url.href, error: null };
  }

  function addRoute(): void {
    const resolved = resolveRoute();
    if (resolved.error !== null) { setRouteError(resolved.error); return; }
    const normalized = normalizeUrl(resolved.href);
    if (!normalized) { setRouteError("Enter a valid route or URL."); return; }
    const card = findCardByNormalizedUrl(normalized) ?? addCanvasCard(resolved.href);
    setRoute("");
    setRouteError(null);
    setOpen(false);
    onAdded(card.id);
  }

  function addArtifact(artifact: HtmlArtifactMetadata): void {
    const card = addCanvasArtifact(artifact);
    setOpen(false);
    onAdded(card.id);
  }

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Add a page to the canvas" stableTrigger>
        <BasePopover.Trigger
          render={
            <Button
              variant="quiet"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-test="canvas-add-page"
            />
          }
        >
          <IconPlus size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
          <span>Add page</span>
        </BasePopover.Trigger>
      </Tooltip>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner className="add-page-menu__positioner" side="bottom" align="start" sideOffset={6}>
          <BasePopover.Popup className="add-page-menu" aria-label="Add page" data-test="canvas-add-page-menu">
            <form
              className="add-page-menu__section"
              onSubmit={(event) => { event.preventDefault(); addRoute(); }}
            >
              <label className="add-page-menu__label" htmlFor="canvas-add-page-route">App page</label>
              <div className="add-page-menu__row">
                <input
                  id="canvas-add-page-route"
                  className="add-page-menu__input"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="/pricing or http://localhost:5173/pricing"
                  value={route}
                  data-test="canvas-add-page-route"
                  onChange={(event) => { setRoute(event.target.value); setRouteError(null); }}
                />
                <Button type="submit" size="compact" variant="secondary" data-test="canvas-add-page-submit">
                  Add
                </Button>
              </div>
              {routeError === null ? null : <p className="add-page-menu__error" role="alert">{routeError}</p>}
            </form>

            <div className="add-page-menu__divider" role="separator" />

            <div className="add-page-menu__section">
              <span className="add-page-menu__label">HTML iterations</span>
              {artifacts === null ? (
                <p className="add-page-menu__muted" role="status">Reading recent iterations…</p>
              ) : artifactsError !== null ? (
                <p className="add-page-menu__error" role="alert">{artifactsError}</p>
              ) : artifacts.length === 0 ? (
                <p className="add-page-menu__muted">
                  No saved iterations. Create one from a frame with its iteration action.
                </p>
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
            </div>

            <p className="add-page-menu__hint">
              <IconLink size={14} stroke="var(--icon-stroke-width)" aria-hidden="true" />
              Turn on link navigation in a frame to add pages you click.
            </p>
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
