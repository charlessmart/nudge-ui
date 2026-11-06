import type { ReactElement } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconForms,
  IconHandClick,
  IconLayoutColumns,
  IconLayoutGrid,
  IconLayoutRows,
  IconLetterT,
  IconLink,
  IconPhoto,
  IconSquare,
  IconVector,
} from "@tabler/icons-react";
import { describeNode } from "../selection/nodeDescription.ts";
import { cx } from "../ui/classNames.ts";
import { layerKind, type LayerKind } from "./layerKind.ts";

const KIND_ICONS: Record<LayerKind, typeof IconSquare> = {
  "flex-row": IconLayoutColumns,
  "flex-column": IconLayoutRows,
  grid: IconLayoutGrid,
  text: IconLetterT,
  image: IconPhoto,
  vector: IconVector,
  input: IconForms,
  button: IconHandClick,
  link: IconLink,
  box: IconSquare,
};

/** Indent per tree level. */
export const LAYER_INDENT = 16;

export function LayerIcon({ element }: { readonly element: Element }): ReactElement {
  const kind = layerKind(element);
  const Icon = KIND_ICONS[kind];
  return <Icon className="layer-row__icon" data-kind={kind} size={14} stroke={1.8} aria-hidden="true" />;
}

export interface LayerRowProps {
  readonly element: HTMLElement;
  readonly depth: number;
  readonly current?: boolean;
  /** Omitted when the layer has no children to show. */
  readonly expanded?: boolean;
  readonly onToggle?: () => void;
  readonly onSelect: () => void;
  readonly onHover?: (element: HTMLElement | null) => void;
  /** Prefix for `data-test` hooks, so each tree keeps its own. */
  readonly testPrefix: string;
  readonly role?: "menuitem" | "treeitem";
}

/** One layer: a disclosure chevron, an icon for what it is, and its tag, id and classes. Shared by the layers panel and the DOM navigator. */
export function LayerRow({ element, depth, current = false, expanded, onToggle, onSelect, onHover, testPrefix, role }: LayerRowProps): ReactElement {
  const label = describeNode(element);
  return (
    <div className="layer-row" data-test={`${testPrefix}-row`}>
      {expanded !== undefined && onToggle ? (
        <button
          type="button"
          className="layer-row__expander"
          data-test={`${testPrefix}-expander`}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          aria-expanded={expanded}
          style={{ left: `calc(var(--space-4) + ${(depth - 1) * LAYER_INDENT}px)` }}
          onMouseEnter={() => onHover?.(null)}
          onClick={onToggle}
        >
          {expanded ? <IconChevronDown size={12} aria-hidden="true" /> : <IconChevronRight size={12} aria-hidden="true" />}
        </button>
      ) : null}
      <button
        type="button"
        className={cx("layer-row__item", current && "layer-row__item--selected")}
        data-test={`${testPrefix}-item`}
        data-current={current ? "true" : undefined}
        data-depth={depth}
        data-cid={element.getAttribute("data-cid") ?? undefined}
        style={{ paddingLeft: `calc(var(--space-8) + ${depth * LAYER_INDENT}px)` }}
        role={role}
        aria-current={current ? "true" : undefined}
        onMouseEnter={() => onHover?.(current ? null : element)}
        onClick={onSelect}
      >
        <LayerIcon element={element} />
        <span className="layer-row__label">{label}</span>
      </button>
    </div>
  );
}
