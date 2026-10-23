import type { InvocationRef } from "../changes/editModel.ts";
import { inspectComponentTargets, inspectRootInvocations } from "../componentSemantics/adapterRegistry.ts";
import type { RuntimeComponentTarget } from "../componentSemantics/types.ts";
import { parseDataSrc, type ParsedSrc } from "../selection/resolveSelection.ts";
import { isRuntimeGeneratedSource } from "../runtime/staticHtmlRuntimeIdentity.ts";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function authoredSource(element: Element): ParsedSrc | null {
  const src = element.getAttribute("data-src");
  return src && !isRuntimeGeneratedSource(src) ? parseDataSrc(src) : null;
}

/**
 * Where `child` is written. A component's root is tagged at the component's definition, so its invocations'
 * callsites say where the instance itself was placed.
 */
function authoredSites(child: Element): ParsedSrc[] {
  // SAFETY: an element in the XHTML namespace is an HTMLElement of its own document's realm.
  const roots = child.namespaceURI === HTML_NAMESPACE ? inspectRootInvocations(child as HTMLElement) ?? [] : [];
  return [authoredSource(child), ...roots.map(({ callsiteId }) => parseDataSrc(callsiteId))]
    .filter((site): site is ParsedSrc => site !== null);
}

function precedes(callsite: ParsedSrc, child: ParsedSrc): boolean {
  return callsite.line < child.line || (callsite.line === child.line && callsite.column < child.column);
}

type ChildEvidence = { kind: "slot"; invocation: InvocationRef } | { kind: "parent" } | { kind: "unknown" };

/** A child placed at an enclosing invocation's callsite fills that invocation's children; one written beside the parent's JSX is the parent's own markup. */
function evidenceOf(child: Element, parentSource: ParsedSrc, targets: readonly RuntimeComponentTarget[]): ChildEvidence {
  const sites = authoredSites(child);
  for (const site of sites) {
    const owner = targets.find(({ meta }) => meta.file === site.file && precedes(meta, site));
    if (owner) return { kind: "slot", invocation: { callsiteId: owner.meta.callsiteId, componentName: owner.meta.componentName } };
  }
  return sites.some((site) => site.file === parentSource.file) ? { kind: "parent" } : { kind: "unknown" };
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
 * `children` are tried in order of preference; one whose placement is unknown passes the question on to the next.
 */
export function childrenSlotInvocation(parent: HTMLElement, children: readonly Element[]): InvocationRef | null {
  const parentSource = authoredSource(parent);
  if (!parentSource) return null;
  const targets = inspectComponentTargets(parent);
  let authoredWithParent = false;
  for (const child of children) {
    const evidence = evidenceOf(child, parentSource, targets);
    if (evidence.kind === "slot") return evidence.invocation;
    if (evidence.kind === "parent") authoredWithParent = true;
  }
  return authoredWithParent ? null : soleRootInvocation(parent);
}

/** The slot a moved element leaves. Only the element itself says where it is written, so its siblings are never consulted. */
export function sourceSlotInvocation(parent: HTMLElement, moved: Element): InvocationRef | null {
  const parentSource = authoredSource(parent);
  if (!parentSource) return null;
  const evidence = evidenceOf(moved, parentSource, inspectComponentTargets(parent));
  return evidence.kind === "slot" ? evidence.invocation : null;
}
