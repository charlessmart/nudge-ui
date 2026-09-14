import type { ReactElement } from "react";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { computeDescendants } from "../selection/hierarchy.ts";
import { Button } from "../ui/Button.tsx";

interface DomNavigationProps {
  selected: SelectedElement;
  hierarchy: HTMLElement[];
}

const MAX_PARENT_LEVELS = 2;
const MAX_CHILD_NODES = 2;

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

export function DomNavigation({ selected, hierarchy }: DomNavigationProps): ReactElement | null {
  const parents = hierarchy.slice(1, MAX_PARENT_LEVELS + 1);
  const children = computeDescendants(selected.domElement, 2, MAX_CHILD_NODES);
  if (parents.length === 0 && children.length === 0) return null;

  return (
    <section className="dom-navigation" data-test="dom-navigation" aria-label="DOM navigation">
      <div className="dom-navigation__header">
        <span className="dom-navigation__title">DOM</span>
      </div>
      {parents.length > 0 ? (
        <div className="dom-navigation__group" data-test="dom-parents">
          <span className="dom-navigation__label">Parents</span>
          <div className="dom-navigation__items">
            {parents.map((node, index) => (
              <Button
                key={`${index}-${nodeLabel(node)}`}
                size="compact"
                variant="quiet"
                className="dom-navigation__item"
                data-test="dom-parent-step"
                data-depth={index + 1}
                data-cid={node.getAttribute("data-cid") ?? undefined}
                title={nodeDescription(node)}
                onClick={() => selectNode(node)}
              >
                <span aria-hidden="true">↑</span>
                {index === 0 ? "Parent" : "Grandparent"}
                <span className="dom-navigation__value">{nodeLabel(node)}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {children.length > 0 ? (
        <div className="dom-navigation__group" data-test="dom-children">
          <span className="dom-navigation__label">Children</span>
          <div className="dom-navigation__items">
            {children.map(({ element, depth }, index) => (
              <Button
                key={`${depth}-${index}-${nodeLabel(element)}`}
                size="compact"
                variant="quiet"
                className="dom-navigation__item"
                data-test="dom-child-step"
                data-depth={depth}
                data-cid={element.getAttribute("data-cid") ?? undefined}
                title={nodeDescription(element)}
                onClick={() => selectNode(element)}
              >
                <span aria-hidden="true">↓</span>
                {depth === 1 ? "Child" : "Descendant"}
                <span className="dom-navigation__value">{nodeLabel(element)}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
