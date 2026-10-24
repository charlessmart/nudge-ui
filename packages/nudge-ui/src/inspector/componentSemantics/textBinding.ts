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
  hasSafeMixedDescendants,
  isInApplicationEditingHost,
  isUnsafeTextHost,
  resolveTextProjectionTextNode,
  textProjectionSelector,
} from "../projection/textProjection.ts";
import type { TextBindingEvidence, TextProjectionScope, TextProjectionTarget } from "../changes/editModel.ts";

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
  renderedTarget: TextProjectionTarget | null;
  renderedSource?: TextBindingRenderedSource;
}

export interface TextBindingCandidate {
  binding: TextEditBinding;
  editableTarget?: EditableComponentTarget;
  element: HTMLElement;
  textNode: Text;
  before: string;
  bindingChoices?: TextBindingChoice[];
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
  // `element.closest()` only checks the selected root; an editing island can live deeper, so inspect the text node's own chain as well.
  const editingHost = textNode.parentElement?.closest<HTMLElement>("[contenteditable]");
  if (!editingHost) return false;
  return editingHost.getAttribute("data-inline-editor") !== "true"
    && editingHost.getAttribute("contenteditable") !== "false"
    && (editingHost === element || element.contains(editingHost) || editingHost.contains(element));
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

function isHiddenTextNode(element: HTMLElement, textNode: Text): boolean {
  let current = textNode.parentElement;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none"
      || style?.visibility === "hidden"
      || style?.visibility === "collapse"
      || style?.contentVisibility === "hidden") {
      return true;
    }
    if (current === element) break;
    current = current.parentElement;
  }
  return false;
}

function textNodesFor(element: HTMLElement): Text[] {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, 0x4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (isTextNode(node)
      && normalizedText(node.nodeValue ?? "")
      && !isHiddenTextNode(element, node)) {
      nodes.push(node);
    }
    node = walker.nextNode();
  }
  return nodes;
}

function isSafeRenderedTextHost(element: HTMLElement, textNode: Text): boolean {
  if (isUnsafeTextHost(element) || isInApplicationEditingHost(element)) return false;
  if (element.children.length === 0) {
    const directTextNodes = Array.from(element.childNodes).filter((node) => node.nodeType === 3);
    return directTextNodes.length === 1 && directTextNodes[0] === textNode;
  }
  return element.contains(textNode) && hasSafeMixedDescendants(element);
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
  // Compatibility fallback for adapters predating multiplicity: it can prove one root, never an arbitrary count.
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
  // A component target is source evidence only when its callsite produced this exact DOM root; otherwise the element's own data-src remains the source.
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
      && !isHiddenTextNode(root, textNode)
      && isSafeRenderedTextHost(root, textNode);
  });
  return matching.length === 1;
}

function parseRenderedSource(src: string) {
  const match = /^(.*):(\d+):(\d+)$/.exec(src);
  if (!match) return { file: src, line: 0, column: 0 };
  return { file: match[1] ?? src, line: Number(match[2]), column: Number(match[3]) };
}

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

/** Text nodes and the temporary editor host are not identity; the returned callsite is the durable one. */
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
  // Descendant markup is intentionally not included: a semantic binding may still own a nested text node, while the rendered fallback keeps its stricter direct-leaf rule.
  if (isUnsafeTextHost(element)) {
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

  // Equal-priority candidates are handed to the inline chooser, never guessed.
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
    // Expressions/spreads are source-logic intent; a callsite override would fan out to every item, so keep one durable text target instead.
    return renderedTextCandidate(element, textNode, before, match);
  }
  if (match.mountedCount! > 1 && authoredAs === "literal") {
    // Item-only scope must validate against the same bounded before-text evidence as the durable projection; source-site stays safe either way.
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
    // A missing rendered projection only removes the item-scoped option; the all-output source-site edit is still a safe canonical change.
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
