import type { InvocationRef } from "../changes/editModel.ts";
import { inspectComponentTargets, inspectRootInvocations } from "../componentSemantics/adapterRegistry.ts";
import { parseDataSrc, type ParsedSrc } from "../selection/resolveSelection.ts";
import { isRuntimeGeneratedSource } from "../runtime/staticHtmlRuntimeIdentity.ts";

function authoredSource(element: Element): ParsedSrc | null {
  const src = element.getAttribute("data-src");
  return src && !isRuntimeGeneratedSource(src) ? parseDataSrc(src) : null;
}

function precedes(callsite: ParsedSrc, child: ParsedSrc): boolean {
  return callsite.line < child.line || (callsite.line === child.line && callsite.column < child.column);
}

/**
 * Without an authored child, a root that belongs to exactly one invocation is assumed to render its children. A
 * composed root (Stack rendering Box) belongs to several, and nothing in the DOM says which one receives children.
 */
function soleRootInvocation(parent: HTMLElement): InvocationRef | null {
  const roots = inspectRootInvocations(parent);
  const root = roots?.length === 1 ? roots[0]! : null;
  if (!root || root.callsiteId === parent.getAttribute("data-src")) return null;
  return { callsiteId: root.callsiteId, componentName: root.componentName };
}

/**
 * The invocation whose children `parent` renders, when they are authored at its callsite rather than beside the
 * parent's own JSX. A component's root carries the source site of its definition, so without this a move into
 * `<Stack>` would point the agent at Stack's definition instead of the place it is used.
 *
 * `children` are tried in order of preference. Component roots and the component's internal markup name no
 * enclosing invocation, so they pass the question on to the next child.
 */
export function childrenSlotInvocation(parent: HTMLElement, children: readonly Element[]): InvocationRef | null {
  const parentSource = authoredSource(parent);
  if (!parentSource) return null;
  const targets = inspectComponentTargets(parent);
  let authoredWithParent = false;
  for (const child of children) {
    const childSource = authoredSource(child);
    if (!childSource) continue;
    if (childSource.file === parentSource.file) {
      authoredWithParent = true;
      continue;
    }
    const owner = targets.find(({ meta }) => meta.file === childSource.file && precedes(meta, childSource));
    if (owner) return { callsiteId: owner.meta.callsiteId, componentName: owner.meta.componentName };
  }
  return authoredWithParent ? null : soleRootInvocation(parent);
}
