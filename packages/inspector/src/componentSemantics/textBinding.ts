import {
  callsiteMultiplicity,
  editableComponentTargets,
  inspectComponentTargets,
} from "./adapterRegistry.ts";
import type {
  ComponentChangeTarget,
  EditableComponentTarget,
} from "./types.ts";
import {
  captureTextProjectionTarget,
  resolveTextProjectionTextNode,
  textProjectionSelector,
} from "../projection/textProjection.ts";
import type { TextProjectionTarget } from "../inline-text/textChangeBoundary.ts";
import type { TextBindingEvidence, TextProjectionScope } from "../inline-text/textChangeBoundary.ts";

/** The order used when more than one visible prop has the same value. */
export const VISIBLE_TEXT_PROP_PRIORITY = [
  "children",
  "label",
  "text",
  "caption",
  "description",
  "title",
] as const;

const STRUCTURAL_TEXT_PROPS = new Set([
  "id",
  "className",
  "href",
  "src",
  "role",
  "style",
]);

const UNSAFE_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION"]);
const UNSAFE_MIXED_DESCENDANT_TAGS = new Set([
  ...UNSAFE_TEXT_TAGS,
  "INPUT",
  "SELECT",
  "BUTTON",
  "A",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "MARK",
  "CODE",
  "S",
  "DEL",
  "INS",
]);

function isStructuralTextProp(name: string): boolean {
  return STRUCTURAL_TEXT_PROPS.has(name)
    || name.startsWith("data")
    || name.startsWith("aria-")
    || name.startsWith("aria");
}

export type TextEditRejectionReason =
  | "no-text"
  | "no-binding"
  | "ambiguous-binding"
  | "editing-active"
  | "unsafe-target";

export interface TextEditRejection {
  kind: "rejected";
  reason: TextEditRejectionReason;
  message: string;
}

export type TextEditBinding =
  | {
    kind: "component-prop";
    property: string;
    target: ComponentChangeTarget;
  }
  | {
    kind: "rendered-text";
    target: TextProjectionTarget;
  };

export interface ComponentTextEditBinding {
  kind: "component-prop";
  property: string;
  target: ComponentChangeTarget;
}

export interface TextBindingRenderedSource {
  file: string;
  line: number;
  column: number;
  component: string;
  selector: string;
  authoredAs: "literal" | "expression" | "unknown";
  evidence?: TextBindingEvidence;
}

export interface TextBindingChoice {
  binding: ComponentTextEditBinding;
  editableTarget: EditableComponentTarget;
  mountedCount: number;
  authoredAs: "literal" | "expression" | "spread" | "default";
  /** Durable target/source evidence for an item-only commit. */
  renderedTarget: TextProjectionTarget | null;
  renderedSource?: TextBindingRenderedSource;
}

export interface TextBindingCandidate {
  binding: TextEditBinding;
  /** Runtime target retained privately for semantic canonical records. */
  editableTarget?: EditableComponentTarget;
  element: HTMLElement;
  textNode: Text;
  before: string;
  /** Equal-priority semantic candidates are selected by the inline chooser. */
  bindingChoices?: TextBindingChoice[];
  /** Repeated literal invocations expose this scope choice before commit. */
  scope?: TextProjectionScope;
  scopeChoices?: TextProjectionScope[];
  mountedCount?: number;
  renderedTarget?: TextProjectionTarget;
  renderedSource?: TextBindingRenderedSource;
  /** Existing inspector affordance hidden while its empty node is edited. */
  emptyProjectionMarker?: HTMLElement;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isApplicationEditingHost(element: HTMLElement): boolean {
  const host = element.closest<HTMLElement>("[contenteditable]");
  if (!host) return false;
  return host.getAttribute("data-inline-editor") !== "true"
    && host.getAttribute("contenteditable") !== "false";
}

function isApplicationEditingTextNode(element: HTMLElement, textNode: Text): boolean {
  // `element.closest()` only checks the selected root. A tracked root can
  // contain an application-owned editing island, so inspect the text node's
  // complete ancestor chain as well.
  const editingHost = textNode.parentElement?.closest<HTMLElement>("[contenteditable]");
  if (!editingHost) return false;
  return editingHost.getAttribute("data-inline-editor") !== "true"
    && editingHost.getAttribute("contenteditable") !== "false"
    && (editingHost === element || element.contains(editingHost) || editingHost.contains(element));
}

function isUnsafeSemanticHost(element: HTMLElement): boolean {
  return UNSAFE_TEXT_TAGS.has(element.tagName);
}

function isVisibleTextProp(name: string): name is typeof VISIBLE_TEXT_PROP_PRIORITY[number] {
  return VISIBLE_TEXT_PROP_PRIORITY.some((candidate) => candidate === name);
}

function propPriority(name: string): number {
  const index = isVisibleTextProp(name) ? VISIBLE_TEXT_PROP_PRIORITY.indexOf(name) : -1;
  return index < 0 ? VISIBLE_TEXT_PROP_PRIORITY.length : index;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === 3;
}

function textNodesFor(element: HTMLElement): Text[] {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, 0x4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (isTextNode(node) && normalizedText(node.nodeValue ?? "")) {
      nodes.push(node);
    }
    node = walker.nextNode();
  }
  return nodes;
}

function isSafeRenderedTextHost(element: HTMLElement, textNode: Text): boolean {
  if (UNSAFE_TEXT_TAGS.has(element.tagName)) return false;
  const editingHost = element.closest<HTMLElement>("[contenteditable]");
  if (editingHost
    && editingHost.getAttribute("data-inline-editor") !== "true"
    && editingHost.getAttribute("contenteditable") !== "false") return false;
  if (element.children.length === 0) {
    const directTextNodes = Array.from(element.childNodes).filter((node) => node.nodeType === 3);
    return directTextNodes.length === 1 && directTextNodes[0] === textNode;
  }
  if (!element.contains(textNode)) return false;
  // A line break is layout structure, not rich text content. When the exact
  // text node is captured, wrapping that node leaves the <br> in place and
  // preserves both lines. Other inline formatting remains rejected because
  // replacing text inside it would silently flatten authored markup.
  for (const descendant of Array.from(element.querySelectorAll<HTMLElement>("*"))) {
    if (UNSAFE_MIXED_DESCENDANT_TAGS.has(descendant.tagName)) return false;
    const descendantEditingHost = descendant.closest<HTMLElement>("[contenteditable]");
    if (descendantEditingHost
      && descendantEditingHost.getAttribute("data-inline-editor") !== "true"
      && descendantEditingHost.getAttribute("contenteditable") !== "false") return false;
  }
  return true;
}

function textNodeAtPoint(element: HTMLElement, point?: { x: number; y: number }): Text | null {
  const nodes = textNodesFor(element);
  if (nodes.length === 0) return null;
  if (!point) return nodes[0] ?? null;

  for (const node of nodes) {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const rects = typeof range.getClientRects === "function"
      ? Array.from(range.getClientRects())
      : [];
    if (rects.some((rect) => point.x >= rect.left && point.x <= rect.right
      && point.y >= rect.top && point.y <= rect.bottom)) {
      return node;
    }
  }
  return nodes[0] ?? null;
}

interface SemanticCandidateRecord {
  target: EditableComponentTarget;
  property: string;
  priority: number;
  mountedCount: number | null;
}

function targetBinding(target: EditableComponentTarget, property: string): ComponentTextEditBinding {
  return {
    kind: "component-prop",
    property,
    target: {
      framework: target.framework,
      componentId: target.contract.componentId,
      callsiteId: target.meta.callsiteId,
      componentName: target.meta.componentName,
      file: target.meta.file,
      line: target.meta.line,
      column: target.meta.column,
    },
  };
}

function authoredAsFor(
  target: EditableComponentTarget,
  property: string,
): "literal" | "expression" | "spread" | "default" {
  return target.meta.authoredProps[property]
    ?? (target.meta.authoredProps["..."] ? "spread" : "default");
}

function mountedCountFor(element: HTMLElement, target: EditableComponentTarget): number | null {
  const mountedCount = callsiteMultiplicity(target);
  if (mountedCount !== null) return mountedCount;
  // Adapters written before multiplicity was introduced may still provide a
  // marker-backed inspection. Keep that compatibility fallback conservative:
  // it can prove one root, but it can never prove an arbitrary count.
  return hasUniqueInvocationEvidence(element, target.meta.callsiteId) ? 1 : null;
}

function candidatesForText(
  element: HTMLElement,
  renderedText: string,
): SemanticCandidateRecord[] {
  const candidates: SemanticCandidateRecord[] = [];
  const targets = editableComponentTargets(inspectComponentTargets(element));
  for (const target of targets) {
    for (const prop of target.contract.props) {
      if (prop.control !== "text") continue;
      if (isStructuralTextProp(prop.name)) continue;
      const current = target.props[prop.name];
      if (typeof current !== "string" || normalizedText(current) !== normalizedText(renderedText)) continue;
      candidates.push({
        target,
        property: prop.name,
        priority: propPriority(prop.name),
        mountedCount: mountedCountFor(element, target),
      });
    }
  }
  return candidates;
}

function renderedTextCandidate(
  element: HTMLElement,
  textNode: Text,
  before: string,
  semantic?: SemanticCandidateRecord,
  requireUnique = true,
): TextBindingCandidate | TextEditRejection {
  if (!isSafeRenderedTextHost(element, textNode)) {
    return {
      kind: "rejected",
      reason: "unsafe-target",
      message: "Rendered text with descendant markup cannot be edited as one text projection.",
    };
  }
  const target = captureTextProjectionTarget(element, before, textNode);
  if (!target) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "The rendered copy has no durable source identity for a text projection.",
    };
  }
  if (requireUnique && !hasUniqueRenderedIdentity(element, target)) {
    return {
      kind: "rejected",
      reason: "ambiguous-binding",
      message: "More than one rendered text root shares this source and evidence identity.",
    };
  }
  const componentTarget = semantic?.target ?? inspectComponentTargets(element)[0];
  const semanticProperty = semantic?.property;
  // A component target is only source evidence when it is the callsite that
  // produced this exact DOM root. For text inside a child host element, the
  // nearest boundary is the enclosing component invocation, so the element's
  // own data-src must remain the prompt/change source.
  const elementDataSrc = element.getAttribute("data-src");
  const elementSource = parseRenderedSource(elementDataSrc ?? "");
  const matchingComponentTarget = componentTarget
    && componentTarget.meta.callsiteId === elementDataSrc
    ? componentTarget
    : null;
  const semanticAuthored = semantic
    ? authoredAsFor(semantic.target, semantic.property)
    : matchingComponentTarget?.meta.authoredProps.children;
  const authoredAs: "literal" | "expression" | "unknown" = semanticAuthored === "literal"
    ? "literal"
    : semanticAuthored === "expression" || semanticAuthored === "spread"
      ? "expression"
      : "unknown";
  const source = semantic
    ? {
      file: semantic.target.meta.file,
      line: semantic.target.meta.line,
      column: semantic.target.meta.column,
      component: semantic.target.meta.componentName,
    }
    : matchingComponentTarget
      ? {
        file: matchingComponentTarget.meta.file,
        line: matchingComponentTarget.meta.line,
        column: matchingComponentTarget.meta.column,
        component: matchingComponentTarget.meta.componentName,
      }
      : {
        file: elementSource.file || componentTarget?.meta.file || "",
        line: elementSource.file ? elementSource.line : componentTarget?.meta.line ?? 0,
        column: elementSource.file ? elementSource.column : componentTarget?.meta.column ?? 0,
        component: element.getAttribute("data-cid") ?? componentTarget?.meta.componentName ?? "Rendered text",
      };
  const evidence = semantic && semantic.mountedCount !== null
    ? {
      callsiteId: semantic.target.meta.callsiteId,
      componentName: semantic.target.meta.componentName,
      property: semanticProperty ?? "children",
      mountedCount: semantic.mountedCount,
    }
    : undefined;
  return {
    binding: { kind: "rendered-text", target },
    element,
    textNode,
    before,
    // Keep this private metadata on the candidate for canonical source data.
    renderedSource: {
      file: source.file,
      line: source.line,
      column: source.column,
      component: source.component,
      selector: textProjectionSelector(target) ?? "",
      authoredAs,
      evidence,
    },
    renderedTarget: target,
    scope: "rendered-instance",
  };
}

function renderedMetadataForChoice(
  element: HTMLElement,
  textNode: Text,
  before: string,
  semantic: SemanticCandidateRecord,
): { target: TextProjectionTarget; source: TextBindingRenderedSource } | null {
  const rendered = renderedTextCandidate(element, textNode, before, semantic, false);
  if (!("element" in rendered)) return null;
  if (rendered.binding.kind !== "rendered-text" || !rendered.renderedSource || !rendered.renderedTarget) {
    return null;
  }
  return { target: rendered.renderedTarget, source: rendered.renderedSource };
}

function hasUniqueRenderedIdentity(
  element: HTMLElement,
  target: TextProjectionTarget,
): boolean {
  const selector = textProjectionSelector(target);
  if (!selector) return false;
  let roots: HTMLElement[];
  try {
    roots = Array.from(element.ownerDocument.querySelectorAll<HTMLElement>(selector));
  } catch {
    return false;
  }
  const matching = roots.filter((root) => {
    if (root.getAttribute("data-cprops") !== target.props
      || root.getAttribute("aria-label") !== target.ariaLabel) return false;
    const textNode = resolveTextProjectionTextNode(root, target, target.beforeText);
    return textNode !== null
      && isSafeRenderedTextHost(root, textNode);
  });
  return matching.length === 1;
}

function parseRenderedSource(src: string) {
  const match = /^(.*):(\d+):(\d+)$/.exec(src);
  if (!match) return { file: src, line: 0, column: 0 };
  return { file: match[1] ?? src, line: Number(match[2]), column: Number(match[3]) };
}

/**
 * Compatibility evidence for adapters that predate the mounted-count seam.
 * React itself reports multiplicity through the runtime Adapter registry; this
 * fallback is only a one-root proof and is never used to pick an occurrence.
 */
function hasUniqueInvocationEvidence(element: HTMLElement, callsiteId: string): boolean {
  const nodes = Array.from(
    element.ownerDocument.querySelectorAll<HTMLElement>("[data-cid]"),
  );
  const matches = new Set<HTMLElement>();
  for (const node of nodes) {
    if (inspectComponentTargets(node).some((target) => target.meta.callsiteId === callsiteId)) {
      matches.add(node);
    }
  }
  if (matches.size === 0) return false;
  if (![...matches].some((root) => root === element || root.contains(element))) return false;

  let roots = 0;
  for (const node of matches) {
    let parent = node.parentElement;
    let nested = false;
    while (parent) {
      if (matches.has(parent)) {
        nested = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (!nested) roots += 1;
    if (roots > 1) return false;
  }
  return roots === 1;
}

/**
 * Resolves only a confidently matched semantic string binding. Text nodes and
 * the temporary editor host are not identity: the returned component target is
 * the durable callsite used by the canonical component-prop record.
 */
export function resolveTextBinding(
  element: HTMLElement,
  point?: { x: number; y: number },
): TextBindingCandidate | TextEditRejection {
  if (isApplicationEditingHost(element)) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "Application-owned editing surfaces are not managed by the inspector.",
    };
  }
  // Hard-dangerous hosts are rejected before adapter inspection. Descendant
  // markup is intentionally not included: a confident semantic component
  // binding may still own a nested text node, while rendered fallback keeps
  // its stricter direct-leaf requirement.
  if (isUnsafeSemanticHost(element)) {
    return {
      kind: "rejected",
      reason: "unsafe-target",
      message: "Script, style, form-control, and option contents are not editable text targets.",
    };
  }
  const textNode = textNodeAtPoint(element, point);
  if (!textNode) {
    return {
      kind: "rejected",
      reason: "no-text",
      message: "The selected element does not contain editable visible text.",
    };
  }
  if (isApplicationEditingTextNode(element, textNode)) {
    return {
      kind: "rejected",
      reason: "no-binding",
      message: "Application-owned editing surfaces are not managed by the inspector.",
    };
  }
  const before = textNode.nodeValue ?? "";
  const candidates = candidatesForText(element, before);
  if (candidates.length === 0) {
    return renderedTextCandidate(element, textNode, before);
  }

  const bestPriority = Math.min(...candidates.map((candidate) => candidate.priority));
  const best = candidates.filter((candidate) => candidate.priority === bestPriority);
  const unique = new Map<string, SemanticCandidateRecord>();
  for (const candidate of best) {
    const key = `${candidate.target.meta.callsiteId}\u0000${candidate.property}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const choices = [...unique.values()];
  if (choices.some((candidate) => candidate.mountedCount === null)) {
    return {
      kind: "rejected",
      reason: "ambiguous-binding",
      message: "The component text has no reliable mounted-callsite evidence; refusing a broad semantic override.",
    };
  }

  const first = choices[0]!;
  const firstBinding = targetBinding(first.target, first.property);
  const bindingChoices: TextBindingChoice[] = choices.map((candidate) => {
    const rendered = renderedMetadataForChoice(element, textNode, before, candidate);
    return {
      binding: targetBinding(candidate.target, candidate.property),
      editableTarget: candidate.target,
      mountedCount: candidate.mountedCount!,
      authoredAs: authoredAsFor(candidate.target, candidate.property),
      renderedTarget: rendered?.target ?? null,
      renderedSource: rendered?.source,
    };
  });

  // Multiple equal-priority candidates are not rejected or guessed. The
  // session exposes these choices to the inline chooser and blocks commit
  // until the user picks one.
  if (choices.length > 1) {
    return {
      binding: firstBinding,
      editableTarget: first.target,
      element,
      textNode,
      before,
      bindingChoices,
      mountedCount: first.mountedCount!,
      scope: first.mountedCount! > 1 ? "rendered-instance" : "source-site",
      scopeChoices: first.mountedCount! > 1 && authoredAsFor(first.target, first.property) === "literal"
        ? ["rendered-instance", "source-site"]
        : undefined,
      renderedTarget: bindingChoices[0]?.renderedTarget ?? undefined,
      renderedSource: bindingChoices[0]?.renderedSource,
    };
  }

  const match = first;
  const authoredAs = authoredAsFor(match.target, match.property);
  const binding = targetBinding(match.target, match.property);
  if (match.mountedCount! > 1 && authoredAs !== "literal") {
    // Expressions/spreads are source-logic intent. A semantic callsite
    // override would fan out to every item, so retain one durable text target
    // and tell the prompt to update the data/source logic.
    return renderedTextCandidate(element, textNode, before, match);
  }
  if (match.mountedCount! > 1 && authoredAs === "literal") {
    // Validate the selected output with the same bounded before-text evidence
    // used by the durable projection. The source-site option remains safe even
    // when identical outputs make an instance impossible to distinguish, but
    // an item-only session is never allowed to guess.
    const rendered = renderedTextCandidate(element, textNode, before, match, false);
    if (!("kind" in rendered)) {
      return {
        ...rendered,
        binding,
        editableTarget: match.target,
        mountedCount: match.mountedCount!,
        scope: "rendered-instance",
        scopeChoices: ["rendered-instance", "source-site"],
      };
    }
    // An unsafe/missing rendered-text projection only removes the item-scoped
    // option. The explicit all-output source-site edit is still a safe
    // canonical component-prop change and must not be rejected because the
    // DOM fallback cannot capture bounded instance evidence.
    return {
      binding,
      editableTarget: match.target,
      element,
      textNode,
      before,
      mountedCount: match.mountedCount!,
      scope: "source-site",
      scopeChoices: ["source-site"],
    };
  }
  // Unique invocation (mountedCount === 1): the callsite is unambiguous, so
  // the source-site edit is always safe and no scope choice is offered. The
  // mountedCount > 1 cases all returned above.
  return {
    binding,
    editableTarget: match.target,
    element,
    textNode,
    before,
    mountedCount: match.mountedCount!,
    scope: "source-site",
  };
}
