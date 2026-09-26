import { useState, type ReactElement } from "react";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { computeNavigationNodes, type NavigationNode } from "../selection/hierarchy.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import type { Rect } from "./overlayGeometry.ts";

export interface DomNavigatorProps {
  selected: SelectedElement;
  hierarchy: HTMLElement[];
  anchor: Rect;
  project: (element: HTMLElement) => Rect | null;
}

function nodeLabel(node: HTMLElement): string {
  return node.getAttribute("data-cid") ?? node.localName;
}

function nodeDescription(node: HTMLElement): string {
  const id = node.id ? `#${node.id}` : "";
  const className = typeof node.className === "string"
    ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join("")
    : "";
  const source = node.getAttribute("data-src");
  return `${node.localName}${id}${className}${source ? ` — ${source}` : ""}`;
}

function selectNode(node: HTMLElement): void {
  const resolved = resolveSelectionFromElement(node);
  if (resolved) setSelectedElement(resolved);
}

export function DomNavigator({ selected, hierarchy, anchor, project }: DomNavigatorProps): ReactElement | null {
  const nodes = computeNavigationNodes(selected.domElement, hierarchy);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  if (nodes.length === 0) return null;

  const preview = hovered ? project(hovered) : null;
  const close = (): void => {
    setExpanded(false);
    setHovered(null);
  };

  return (
    <>
      {preview ? <div className="dom-navigator-preview" data-test="dom-navigator-preview" style={preview} aria-hidden="true" /> : null}
      <div
        className="dom-navigator"
        data-test="dom-navigator"
        aria-label="DOM navigator"
        style={{ left: Math.max(4, anchor.left), top: Math.max(4, anchor.top) }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={close}
        onFocus={() => setExpanded(true)}
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) close();
        }}
      >
        <button
          type="button"
          className="dom-navigator__trigger"
          data-test="dom-navigator-trigger"
          aria-expanded={expanded}
          aria-haspopup="menu"
          title={nodeDescription(selected.domElement)}
          onMouseEnter={() => setHovered(null)}
        >
          <span>{nodeLabel(selected.domElement)}</span>
          <span aria-hidden="true">⌄</span>
        </button>
        {expanded ? (
          <div className="dom-navigator__menu" role="menu">
            {nodes.map((node: NavigationNode) => (
              <button
                key={`${node.direction}-${node.depth}-${node.element.getAttribute("data-cid") ?? node.element.localName}`}
                type="button"
                className="dom-navigator__item"
                data-test="dom-navigator-item"
                data-direction={node.direction}
                data-depth={node.depth}
                data-cid={node.element.getAttribute("data-cid") ?? undefined}
                title={nodeDescription(node.element)}
                role="menuitem"
                onMouseEnter={() => setHovered(node.element)}
                onClick={() => {
                  selectNode(node.element);
                  close();
                }}
              >
                <span aria-hidden="true">{node.direction === "up" ? "↑" : "↓"}</span>
                <span>{nodeLabel(node.element)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
