import { useId, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { IconArtboard, IconChevronDown, IconComponents, IconFile } from "@tabler/icons-react";
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
import { isPageSurface } from "../canvas/pageSurface.ts";
import { getFrameRegistryVersion, subscribeFrameRegistry } from "../canvas/projection.ts";
import { AddFlowMenu, FlowFramesStyle, FlowGroups, FlowsIntro } from "../flows/FlowFrames.tsx";
import { LayerTree } from "../layers/LayerTree.tsx";
import { isDemoRuntime } from "../runtime/runtimeConfig.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { AddPageMenu } from "./AddPageMenu.tsx";
import { toggleCollapsed, useCollapsed } from "./collapseStore.ts";

/** Live pages, iterations and component sheets; flow states are listed under their flow instead. */
function isStandaloneFrame(card: CanvasCard): boolean {
  return card.content.kind !== "route" || !card.content.flowState;
}

const FRAME_ICONS = { route: IconFile, iteration: IconArtboard, component: IconComponents } as const;

interface CollapsibleSectionProps {
  readonly id: "flows" | "pages" | "layers";
  readonly title: string;
  readonly className: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly "data-test"?: string;
}

/** A navigator section whose title folds it away. The chevron sits in the left gutter and shows on hover, so titles keep their edge. */
function CollapsibleSection({ id, title, className, actions, children, "data-test": dataTest }: CollapsibleSectionProps): ReactElement {
  const collapsed = useCollapsed(`section:${id}`);
  const bodyId = useId();
  return (
    <section className={`navigator__section ${className}`} data-test={dataTest} data-collapsed={collapsed ? "true" : undefined}>
      <header className="navigator__section-header">
        <h3 className="navigator__section-title">
          <button
            type="button"
            className="navigator__section-toggle"
            data-test={`navigator-section-toggle-${id}`}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => toggleCollapsed(`section:${id}`)}
          >
            <IconChevronDown className="navigator__section-chevron" size={10} stroke={2} aria-hidden="true" />
            {title}
          </button>
        </h3>
        {actions}
      </header>
      <div id={bodyId} className="navigator__section-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

/** The flows an agent mapped, every other frame on the Canvas, then the active frame's layers. A page inspected in place has only its layers. */
export function FramesView(): ReactElement {
  const cards = useCanvasCards();
  const selectedCardId = useSelectedCardId();
  const focusedCardId = useFocusedCardId();
  const presentation = useCanvasPresentation();
  useSyncExternalStore(subscribeFrameRegistry, getFrameRegistryVersion);
  const activeCardId = selectedCardId ?? focusedCardId;
  const frames = cards.filter(isStandaloneFrame);
  const flowsEnabled = !isDemoRuntime();
  const pageSurface = isPageSurface();

  function open(card: CanvasCard): void {
    if (card.id !== activeCardId) setSelectedElement(null);
    // Focus view swaps the page in place; the Canvas pans to it.
    if (presentation === "focus") focusCard(card.id);
    else revealCanvasCard(card.id);
  }

  return (
    <div className="navigator__frames-view">
      {!pageSurface && flowsEnabled ? (
        <CollapsibleSection id="flows" title="Flows" className="navigator__section--flows" data-test="navigator-flows" actions={<AddFlowMenu />}>
          <FlowFramesStyle />
          <FlowsIntro />
          <FlowGroups activeCardId={activeCardId ?? null} />
        </CollapsibleSection>
      ) : null}
      {!pageSurface ? (
        <CollapsibleSection id="pages" title="Pages" className="navigator__section--frames" actions={<AddPageMenu />}>
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
        </CollapsibleSection>
      ) : null}
      <CollapsibleSection id="layers" title="Layers" className="navigator__section--layers">
        <LayerTree doc={getActiveCanvasDocument()} />
      </CollapsibleSection>
    </div>
  );
}
