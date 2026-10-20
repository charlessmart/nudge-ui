import type { ReactElement } from "react";
import { IconChevronDown, IconListTree } from "@tabler/icons-react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { nodeDescription } from "../overlay/DomNavigator.tsx";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { portalContainer } from "../ui/portalContainer.ts";
import { cx } from "../ui/classNames.ts";
import type { AnimationEntry } from "./animationScan.ts";

interface ScopeNode {
  readonly element: HTMLElement;
  readonly depth: number;
  readonly current: boolean;
}

/** The animation's trigger above the selection, the selection, and the animating elements inside it. */
export function scopeNodes(selected: HTMLElement, entry: AnimationEntry | undefined): ScopeNode[] {
  if (!entry || !("group" in entry)) return [{ element: selected, depth: 0, current: true }];
  const { trigger, members } = entry.group;
  const nodes: ScopeNode[] = [];
  let depth = 0;
  if (trigger !== selected && trigger.contains(selected)) {
    nodes.push({ element: trigger, depth, current: false });
    depth += 1;
  }
  nodes.push({ element: selected, depth, current: true });
  const inside = [...members.keys()].filter((member) => member !== selected && selected.contains(member));
  for (const member of inside) {
    const nested = inside.filter((other) => other !== member && other.contains(member)).length;
    nodes.push({ element: member, depth: depth + 1 + nested, current: false });
  }
  return nodes;
}

function select(element: HTMLElement): void {
  const resolved = resolveSelectionFromElement(element);
  if (resolved) setSelectedElement(resolved);
}

/** Names the selected element and opens a tree of the elements the current animation involves. */
export function AnimationScope({ selected, entry }: { readonly selected: HTMLElement; readonly entry: AnimationEntry | undefined }): ReactElement {
  const nodes = scopeNodes(selected, entry);
  return (
    <BasePopover.Root>
      <BasePopover.Trigger
        render={<button type="button" className="animation-scope__trigger" data-test="animation-scope" aria-label="Elements in this animation" />}
      >
        <IconListTree size={14} aria-hidden="true" />
        <span className="animation-scope__label">{nodeDescription(selected)}</span>
        {nodes.length > 1 ? <IconChevronDown size={12} aria-hidden="true" /> : null}
      </BasePopover.Trigger>
      {nodes.length > 1 ? (
        <BasePopover.Portal container={portalContainer()}>
          <BasePopover.Positioner className="animation-scope__positioner" side="top" align="start" sideOffset={8}>
            <BasePopover.Popup className="animation-scope__menu" role="menu" aria-label="Elements in this animation">
              {nodes.map(({ element, depth, current }) => (
                <button
                  key={`${depth}-${nodeDescription(element)}-${element.getAttribute("data-cid") ?? ""}`}
                  type="button"
                  role="menuitem"
                  className={cx("animation-scope__item", current && "animation-scope__item--selected")}
                  data-test="animation-scope-item"
                  data-current={current ? "true" : undefined}
                  aria-current={current ? "true" : undefined}
                  style={{ paddingLeft: `calc(var(--space-8) + ${depth * 16}px)` }}
                  onClick={() => {
                    if (!current) select(element);
                  }}
                >
                  {nodeDescription(element)}
                </button>
              ))}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      ) : null}
    </BasePopover.Root>
  );
}
