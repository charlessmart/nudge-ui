import { useLayoutEffect, useRef, useSyncExternalStore, type ReactElement } from "react";
import { IconArtboard, IconComponents, IconFile, IconLayoutSidebar } from "@tabler/icons-react";
import {
  focusCard,
  getCanvasCardLabel,
  revealCanvasCard,
  useCanvasCards,
  useFocusedCardId,
  useSelectedCardId,
  type CanvasCard,
} from "../canvas/canvasStore.ts";
import { useCanvasPresentation } from "../canvas/viewStore.ts";
import { getActiveCanvasDocument } from "../canvas/activeCanvasDocument.ts";
import { getFrameRegistryVersion, subscribeFrameRegistry } from "../canvas/projection.ts";
import { ComponentLibraryPanel } from "../library/ComponentLibraryPanel.tsx";
import { FlowFramesStyle, FlowGroups, FlowPromptMenuButton, FlowsIntro } from "../flows/FlowFrames.tsx";
import { LayerTree } from "../layers/LayerTree.tsx";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { isDemoRuntime } from "../runtime/runtimeConfig.ts";
import { setSelectedElement, useSelectedElement } from "../selection/selectionStore.ts";
import { describeElement } from "../shell/elementName.ts";
import { panelWidthTarget } from "../shell/panelWidth.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { SegmentedControl, type SegmentedControlOption } from "../ui/SegmentedControl.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { cx } from "../ui/classNames.ts";
import { AddPageMenu } from "./AddPageMenu.tsx";
import { setNavigatorOpen, setNavigatorView, useNavigatorState, type NavigatorView } from "./navigatorStore.ts";

const NAVIGATOR_WIDTH = 280;

const VIEW_OPTIONS: readonly SegmentedControlOption<NavigatorView>[] = [
  { value: "frames", label: "Pages", testId: "navigator-view-frames" },
  { value: "components", label: "Components", testId: "navigator-view-components" },
];

/** Live pages, iterations and component sheets; flow states are listed under their flow instead. */
function isStandaloneFrame(card: CanvasCard): boolean {
  return card.content.kind !== "route" || !card.content.flowState;
}

const FRAME_ICONS = { route: IconFile, iteration: IconArtboard, component: IconComponents } as const;

/** Every frame on the Canvas, flows grouped by flow, then the active frame's layers. */
function FramesView(): ReactElement {
  const cards = useCanvasCards();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const presentation = useCanvasPresentation();
  useSyncExternalStore(subscribeFrameRegistry, getFrameRegistryVersion);
  const activeCardId = selectedCardId ?? focusedCardId;
  const frames = cards.filter(isStandaloneFrame);
  const flowsEnabled = !isDemoRuntime();

  function open(card: CanvasCard): void {
    if (card.id !== activeCardId) setSelectedElement(null);
    // Focus view swaps the page in place; the Canvas pans to it.
    if (presentation === "focus") focusCard(card.id);
    else revealCanvasCard(card.id);
  }

  return (
    <div className="navigator__frames-view">
      {flowsEnabled ? <><FlowFramesStyle /><FlowsIntro /></> : null}
      <section className="navigator__section navigator__section--frames">
        <header className="navigator__section-header">
          <h3 className="navigator__section-title">Pages</h3>
          <AddPageMenu footer={flowsEnabled ? <FlowPromptMenuButton /> : null} />
        </header>
        <ul className="navigator__list" data-test="navigator-frames">
          {frames.map((card) => {
            const Icon = FRAME_ICONS[card.content.kind];
            return (
              <li key={card.id}>
                <button
                  type="button"
                  className="navigator__item"
                  data-test="navigator-frame"
                  data-card-id={card.id}
                  data-active={card.id === activeCardId ? "true" : undefined}
                  aria-current={card.id === activeCardId ? "page" : undefined}
                  onClick={() => open(card)}
                >
                  <Icon className="navigator__item-icon" size={14} stroke={1.8} aria-hidden="true" />
                  <span className="navigator__item-label">{getCanvasCardLabel(card, cards)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {flowsEnabled ? <FlowGroups activeCardId={activeCardId ?? null} /> : null}
      </section>
      <section className="navigator__section navigator__section--layers">
        <header className="navigator__section-header">
          <h3 className="navigator__section-title">Layers</h3>
        </header>
        <LayerTree doc={getActiveCanvasDocument()} />
      </section>
    </div>
  );
}

/** The Canvas frames with their layers, and the component library, on the left of the Canvas. Collapsed, it shrinks to a chip naming the page and selection. */
export function NavigatorPanel(): ReactElement {
  const config = useNudgeUiRuntimeConfig();
  const { open, view } = useNavigatorState();
  const cards = useCanvasCards();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const selected = useSelectedElement();
  const rootRef = useRef<HTMLDivElement>(null);
  const views = VIEW_OPTIONS.filter((option) =>
    option.value === "frames" || config.componentSheet === true);
  const activeView = views.some((option) => option.value === view) ? view : "frames";

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The Canvas, toolbar and toasts read the reserved space, so they make room for the open panel.
    const host = panelWidthTarget(root);
    if (open) host.style.setProperty("--panel-reserve-start", `${NAVIGATOR_WIDTH}px`);
    else host.style.removeProperty("--panel-reserve-start");
    return () => { host.style.removeProperty("--panel-reserve-start"); };
  }, [open]);

  const activeCard = cards.find((card) => card.id === (selectedCardId ?? focusedCardId));
  const pageLabel = activeCard ? getCanvasCardLabel(activeCard, cards) : null;
  const selectionLabel = selected ? describeElement(selected.domElement).title : null;

  return (
    <div ref={rootRef} className="navigator-root">
      {open ? (
        <nav className="navigator" aria-label="Navigator" data-test="navigator" style={{ width: NAVIGATOR_WIDTH }}>
          <div className="navigator__header">
            <div className="navigator__header-row">
              <Tooltip content="Hide navigator" stableTrigger>
                <IconButton
                  variant="quiet"
                  label="Hide navigator"
                  data-test="navigator-collapse"
                  style={{ marginRight: "calc(var(--space-8) * -1)" }}
                  onClick={() => setNavigatorOpen(false)}
                >
                  <IconLayoutSidebar size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </div>
            {views.length > 1 ? (
              <SegmentedControl
                aria-label="Navigator view"
                data-test="navigator-view"
                className="navigator__view-switch"
                value={activeView}
                options={views}
                onChange={setNavigatorView}
              />
            ) : null}
          </div>
          <div className={cx("navigator__body", `navigator__body--${activeView}`)}>
            {activeView === "components" ? <ComponentLibraryPanel /> : <FramesView />}
          </div>
        </nav>
      ) : (
        <button
          type="button"
          className="navigator-chip"
          data-test="navigator-expand"
          aria-label="Show navigator"
          onClick={() => setNavigatorOpen(true)}
        >
          <IconLayoutSidebar size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          {pageLabel ? <span className="navigator-chip__page">{pageLabel}</span> : null}
          {selectionLabel ? <span className="navigator-chip__selection">{selectionLabel}</span> : null}
        </button>
      )}
    </div>
  );
}
