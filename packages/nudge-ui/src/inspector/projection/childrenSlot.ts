import type { InvocationRef } from "../changes/editModel.ts";
import { inspectComponentTargets, inspectRootInvocations } from "../componentSemantics/adapterRegistry.ts";
import { parseDataSrc, type ParsedSrc } from "../selection/resolveSelection.ts";
import { isRuntimeGeneratedSource } from "../runtime/staticHtmlRuntimeIdentity.ts";

function authoredSource(element: HTMLElement): ParsedSrc | null {
  const src = element.getAttribute("data-src");
  return src && !isRuntimeGeneratedSource(src) ? parseDataSrc(src) : null;
}

function precedes(callsite: ParsedSrc, child: ParsedSrc): boolean {
  return callsite.line < child.line || (callsite.line === child.line && callsite.column < child.column);
}

/**
 * The invocation whose children `parent` renders, when they are authored at its callsite rather than beside the
 * parent's own JSX. A component's root carries the source site of its definition, so without this a move into
 * `<Stack>` would point the agent at Stack's definition instead of the place it is used.
 *
 * `authoredChild` is a child authored in the slot; without one, the nearest root invocation is assumed to render
 * its children into its root.
 */
export function childrenSlotInvocation(parent: HTMLElement, authoredChild: HTMLElement | null): InvocationRef | null {
  const parentSource = authoredSource(parent);
  if (!parentSource) return null;
  if (!authoredChild) {
    const parentSrc = parent.getAttribute("data-src");
    const root = inspectRootInvocations(parent)?.find((invocation) => invocation.callsiteId !== parentSrc);
    return root ? { callsiteId: root.callsiteId, componentName: root.componentName } : null;
  }
  const childSource = authoredSource(authoredChild);
  if (!childSource || childSource.file === parentSource.file) return null;
  const owner = inspectComponentTargets(parent).find(({ meta }) =>
    meta.file === childSource.file && precedes(meta, childSource));
  return owner ? { callsiteId: owner.meta.callsiteId, componentName: owner.meta.componentName } : null;
}
