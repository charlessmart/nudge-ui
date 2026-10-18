import { useState, type ReactElement } from "react";
import { IconChevronDown, IconChevronRight, IconMenu2 } from "@tabler/icons-react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { computeNavigationParents, computeTrackedChildren, hasTrackedChildren } from "../selection/hierarchy.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import type { Rect } from "./overlayGeometry.ts";
import { portalContainer } from "../ui/portalContainer.ts";
import { cx } from "../ui/classNames.ts";

export interface DomNavigatorProps {
  selected: SelectedElement;
  hierarchy: HTMLElement[];
  anchor: Rect;
  project: (element: HTMLElement) => Rect | null;
  /** The selection is a component or shares its source with other elements. */
  linked?: boolean;
}

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

export function DomNavigator({ selected, hierarchy, anchor, project, linked = false }: DomNavigatorProps): ReactElement | null {
  const children = computeTrackedChildren(selected.domElement);
  const parents = computeNavigationParents(hierarchy, children.elements.length > 0);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<HTMLElement>>(new Set());
  if (parents.length === 0 && children.elements.length === 0) return null;

  const preview = hovered ? project(hovered) : null;
  const setOpen = (next: boolean): void => {
    setExpanded(next);
    if (!next) {
      setHovered(null);
      setOpened(new Set());
    }
  };
  const toggleOpened = (element: HTMLElement): void => {
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(element)) next.add(element);
      return next;
    });
  };
  const renderItem = (key: string, element: HTMLElement | null, depth: number): ReactElement => {
    const current = element === null;
    const target = element ?? selected.domElement;
    return (
      <button
        key={key}
        type="button"
        className={cx("dom-navigator__item", current && "dom-navigator__item--selected")}
        data-test="dom-navigator-item"
        data-current={current ? "true" : undefined}
        data-depth={depth}
        data-cid={target.getAttribute("data-cid") ?? undefined}
        style={{ paddingLeft: `calc(var(--space-8) + ${depth * 16}px)` }}
        role="menuitem"
        aria-current={current ? "true" : undefined}
        onMouseEnter={() => setHovered(current ? null : target)}
        onClick={() => {
          if (!current) selectNode(target);
          setOpen(false);
        }}
      >
        <span>{nodeDescription(target)}</span>
      </button>
    );
  };
  const renderChildren = (list: ReturnType<typeof computeTrackedChildren>, depth: number, path: string): ReactElement[] => [
    ...list.elements.flatMap((element, index) => {
      const key = `${path}/${index}`;
      const nested = opened.has(element) ? computeTrackedChildren(element) : null;
      const expandable = hasTrackedChildren(element);
      return [
        <div key={key} className="dom-navigator__row" data-test="dom-navigator-row">
          {expandable ? (
            <button
              type="button"
              className="dom-navigator__expander"
              data-test="dom-navigator-expander"
              aria-label={`${nested ? "Collapse" : "Expand"} ${nodeDescription(element)}`}
              aria-expanded={nested !== null}
              style={{ left: `calc(var(--space-4) + ${(depth - 1) * 16}px)` }}
              onMouseEnter={() => setHovered(null)}
              onClick={() => toggleOpened(element)}
            >
              {nested ? <IconChevronDown size={12} aria-hidden="true" /> : <IconChevronRight size={12} aria-hidden="true" />}
            </button>
          ) : null}
          {renderItem(key, element, depth)}
        </div>,
        ...(nested ? renderChildren(nested, depth + 1, key) : []),
      ];
    }),
    ...(list.hidden > 0
      ? [(
        <div
          key={`${path}/more`}
          className="dom-navigator__more"
          data-test="dom-navigator-more"
          style={{ paddingLeft: `calc(var(--space-8) + ${depth * 16}px)` }}
        >
          +{list.hidden} more
        </div>
      )]
      : []),
  ];

  return (
    <>
      {preview ? <div className="dom-navigator-preview" data-test="dom-navigator-preview" style={preview} aria-hidden="true" /> : null}
      <div
        className="dom-navigator"
        data-test="dom-navigator"
        data-linked={linked ? "true" : undefined}
        aria-label="DOM navigator"
        style={{ left: Math.max(4, anchor.left), top: Math.max(4, anchor.top - 28) }}
      >
        <BasePopover.Root open={expanded} onOpenChange={setOpen}>
          <BasePopover.Trigger
            render={
              <button
                type="button"
                className="dom-navigator__trigger"
                data-test="dom-navigator-trigger"
                aria-label="Open DOM navigator"
                aria-haspopup="menu"
                aria-expanded={expanded}
                onMouseEnter={() => setHovered(null)}
              />
            }
          >
            <IconMenu2 size={14} aria-hidden="true" />
          </BasePopover.Trigger>
          <span className="dom-navigator__label">{nodeDescription(selected.domElement)}</span>
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
                onMouseLeave={() => setHovered(null)}
              >
                {parents.slice().reverse().map((element, index) => renderItem(`up-${index}`, element, index))}
                {renderItem("current", null, parents.length)}
                {renderChildren(children, parents.length + 1, "down")}
              </BasePopover.Popup>
            </BasePopover.Positioner>
          </BasePopover.Portal>
        </BasePopover.Root>
      </div>
    </>
  );
}
