import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useHierarchy, useSelectedElement, setSelectedElement } from "../selection/selectionStore.ts";
import { computeTrackedChildren, hasTrackedChildren, type TrackedChildren } from "../selection/hierarchy.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { getElementWindow } from "../runtime/domRealm.ts";
import { LAYER_INDENT, LayerRow } from "./LayerRow.tsx";

/** Re-renders when the document's element tree changes, at most once a frame. */
function useTreeRevision(doc: Document | null): void {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const body = doc?.body;
    if (!body) return;
    const view = getElementWindow(body);
    let scheduled = 0;
    const observer = new view.MutationObserver(() => {
      if (scheduled) return;
      scheduled = view.requestAnimationFrame(() => {
        scheduled = 0;
        setRevision((revision) => revision + 1);
      });
    });
    observer.observe(body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scheduled) view.cancelAnimationFrame(scheduled);
    };
  }, [doc]);
}

/** Whether the row is fully visible in the nearest ancestor that scrolls vertically. */
function isRowInView(row: Element): boolean {
  let parent: Element | null = row.parentElement;
  while (parent) {
    const { overflowY } = getElementWindow(parent).getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
      const box = row.getBoundingClientRect();
      const view = parent.getBoundingClientRect();
      return box.top >= view.top && box.bottom <= view.bottom;
    }
    parent = parent.parentElement;
  }
  return false;
}

/** Every tracked element in a page, with the path to the selection open. */
export function LayerTree({ doc }: { readonly doc: Document | null }): ReactElement {
  const selected = useSelectedElement();
  const hierarchy = useHierarchy();
  const [opened, setOpened] = useState<ReadonlySet<HTMLElement>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  useTreeRevision(doc);

  useEffect(() => {
    // Selecting on the page reveals the selection here, without closing anything the person opened.
    if (hierarchy.length < 2) return;
    setOpened((current) => {
      const ancestors = hierarchy.slice(1);
      if (ancestors.every((element) => current.has(element))) return current;
      return new Set([...current, ...ancestors]);
    });
  }, [hierarchy]);

  // The tree scrolls to a row only for a new selection. Opening the Pages view or a layer keeps the
  // person's scroll position, so the selection the tree mounts with counts as already revealed.
  const revealedRef = useRef<HTMLElement | null>(selected?.domElement ?? null);
  useLayoutEffect(() => {
    const element = selected?.domElement ?? null;
    if (element === revealedRef.current) return;
    if (!element) {
      revealedRef.current = null;
      return;
    }
    const row = listRef.current?.querySelector('[data-current="true"]');
    // The row appears once the effect above opens its ancestors; stop waiting when they are all open.
    if (!row && !hierarchy.slice(1).every((ancestor) => opened.has(ancestor))) return;
    revealedRef.current = element;
    if (row && !isRowInView(row)) row.scrollIntoView({ block: "center", inline: "nearest" });
  }, [selected?.domElement, opened, hierarchy]);

  const body = doc?.body;
  if (!body) return <p className="navigator__empty">Open a page to see its layers.</p>;

  const toggle = (element: HTMLElement): void => setOpened((current) => {
    const next = new Set(current);
    if (!next.delete(element)) next.add(element);
    return next;
  });

  const renderLevel = (list: TrackedChildren, depth: number, path: string): ReactElement[] => [
    ...list.elements.flatMap((element, index) => {
      const key = `${path}/${index}`;
      const open = opened.has(element);
      const expandable = hasTrackedChildren(element);
      const current = element === selected?.domElement;
      return [
        <LayerRow
          key={key}
          element={element}
          depth={depth}
          current={current}
          expanded={expandable ? open : undefined}
          onToggle={() => toggle(element)}
          testPrefix="layer-tree"
          onSelect={() => {
            // The whole row opens a layer; clicking the selected, open layer again closes it.
            if (expandable && (!open || current)) toggle(element);
            const resolved = resolveSelectionFromElement(element);
            if (resolved) setSelectedElement(resolved);
          }}
        />,
        ...(open ? renderLevel(computeTrackedChildren(element), depth + 1, key) : []),
      ];
    }),
    ...(list.hidden > 0
      ? [<p key={`${path}/more`} className="navigator__more" style={{ paddingLeft: `calc(var(--space-8) + ${depth * LAYER_INDENT}px)` }}>+{list.hidden} more</p>]
      : []),
  ];

  const roots = computeTrackedChildren(body);
  return (
    <div ref={listRef} className="layer-tree" role="tree" aria-label="Layers" data-test="layer-tree">
      {roots.elements.length === 0 ? <p className="navigator__empty">No layers yet.</p> : renderLevel(roots, 1, "root")}
    </div>
  );
}
