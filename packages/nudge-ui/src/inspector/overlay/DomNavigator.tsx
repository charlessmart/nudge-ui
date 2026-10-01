import { useEffect, useRef, useState, type ComponentProps, type ReactElement } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { computeNavigationNodes, type NavigationNode } from "../selection/hierarchy.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import type { Rect } from "./overlayGeometry.ts";
import { portalContainer } from "../ui/portalContainer.ts";
import { cx } from "../ui/classNames.ts";

export interface DomNavigatorProps {
  selected: SelectedElement;
  hierarchy: HTMLElement[];
  anchor: Rect;
  project: (element: HTMLElement) => Rect | null;
}

/**
 * Delay before closing after the pointer leaves the trigger or menu, so it can
 * cross the gap between them. Base UI's safe polygon relies on top-document
 * `mousemove`, which stops once the pointer enters the app iframe.
 */
const HOVER_CLOSE_DELAY_MS = 150;

function nodeDescription(node: HTMLElement): string {
  const id = node.id ? `#${node.id}` : "";
  const className = typeof node.className === "string"
    ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join("")
    : "";
  return `${node.localName}${id}${className}`;
}

function selectNode(node: HTMLElement): void {
  const resolved = resolveSelectionFromElement(node);
  if (resolved) setSelectedElement(resolved);
}

export function DomNavigator({ selected, hierarchy, anchor, project }: DomNavigatorProps): ReactElement | null {
  const nodes = computeNavigationNodes(selected.domElement, hierarchy);
  const parents = nodes.filter((node) => node.direction === "up");
  const children = nodes.filter((node) => node.direction === "down");
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
  }, []);
  if (nodes.length === 0) return null;

  const preview = hovered ? project(hovered) : null;
  const cancelScheduledClose = (): void => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = (): void => {
    if (closeTimerRef.current !== null) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setExpanded(false);
      setHovered(null);
    }, HOVER_CLOSE_DELAY_MS);
  };
  const setOpen = (next: boolean): void => {
    cancelScheduledClose();
    setExpanded(next);
    if (!next) setHovered(null);
  };
  const bridge: ComponentProps<"div"> = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: scheduleClose,
  };
  const renderItem = (node: NavigationNode | null, depth: number): ReactElement => {
    const current = node === null;
    const element = current ? selected.domElement : node.element;
    return (
      <button
        key={current ? "current" : `${node.direction}-${node.depth}-${element.getAttribute("data-cid") ?? element.localName}`}
        type="button"
        className={cx("dom-navigator__item", current && "dom-navigator__item--selected")}
        data-test="dom-navigator-item"
        data-current={current ? "true" : undefined}
        data-direction={node?.direction}
        data-depth={depth}
        data-cid={element.getAttribute("data-cid") ?? undefined}
        style={{ paddingLeft: `calc(var(--space-8) + ${depth * 16}px)` }}
        role="menuitem"
        aria-current={current ? "true" : undefined}
        onMouseEnter={() => setHovered(current ? null : element)}
        onClick={() => {
          if (!current) selectNode(element);
          setOpen(false);
        }}
      >
        <span>{nodeDescription(element)}</span>
      </button>
    );
  };

  return (
    <>
      {preview ? <div className="dom-navigator-preview" data-test="dom-navigator-preview" style={preview} aria-hidden="true" /> : null}
      <div
        className="dom-navigator"
        data-test="dom-navigator"
        aria-label="DOM navigator"
        style={{ left: Math.max(4, anchor.left), top: Math.max(4, anchor.top - 28) }}
        {...bridge}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !portalContainer()?.contains(next)) setOpen(false);
        }}
      >
        <BasePopover.Root open={expanded} onOpenChange={setOpen}>
          <BasePopover.Trigger
            render={
              <button
                type="button"
                className="dom-navigator__trigger"
                data-test="dom-navigator-trigger"
                aria-haspopup="menu"
                aria-expanded={expanded}
                onMouseEnter={() => setHovered(null)}
              />
            }
          >
            <span>{nodeDescription(selected.domElement)}</span>
          </BasePopover.Trigger>
          <BasePopover.Portal container={portalContainer()}>
            <BasePopover.Positioner
              className="dom-navigator__positioner"
              side="top"
              align="start"
              sideOffset={4}
            >
              <BasePopover.Popup
                className="dom-navigator__menu"
                role="menu"
                aria-label="DOM navigator"
                {...bridge}
              >
                {parents.slice().reverse().map((node) => renderItem(node, parents.length - node.depth))}
                {renderItem(null, parents.length)}
                {children.map((node) => renderItem(node, parents.length + node.depth))}
              </BasePopover.Popup>
            </BasePopover.Positioner>
          </BasePopover.Portal>
        </BasePopover.Root>
      </div>
    </>
  );
}
