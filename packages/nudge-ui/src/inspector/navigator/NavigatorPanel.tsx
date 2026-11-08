import { useSyncExternalStore, type ReactElement } from "react";
import { IconArtboard, IconComponents, IconFile } from "@tabler/icons-react";
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

/** Live pages, iterations and component sheets; flow states are listed under their flow instead. */
function isStandaloneFrame(card: CanvasCard): boolean {
  return card.content.kind !== "route" || !card.content.flowState;
}

const FRAME_ICONS = { route: IconFile, iteration: IconArtboard, component: IconComponents } as const;

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
        <section className="navigator__section navigator__section--flows" data-test="navigator-flows">
          <FlowFramesStyle />
          <header className="navigator__section-header">
            <h3 className="navigator__section-title">Flows</h3>
            <AddFlowMenu />
          </header>
          <FlowsIntro />
          <FlowGroups activeCardId={activeCardId ?? null} />
        </section>
      ) : null}
      {!pageSurface ? (
        <section className="navigator__section navigator__section--frames">
          <header className="navigator__section-header">
            <h3 className="navigator__section-title">Pages</h3>
            <AddPageMenu />
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
        </section>
      ) : null}
      <section className="navigator__section navigator__section--layers">
        <header className="navigator__section-header">
          <h3 className="navigator__section-title">Layers</h3>
        </header>
        <LayerTree doc={getActiveCanvasDocument()} />
      </section>
    </div>
  );
}
