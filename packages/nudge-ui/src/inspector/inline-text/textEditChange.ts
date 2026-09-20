import { createComponentPropChange } from "../componentSemantics/changeModel.ts";
import type { TextBindingCandidate, TextBindingChoice, TextEditBinding } from "../componentSemantics/textBinding.ts";
import type { ComponentInvocationEvidence } from "../componentSemantics/types.ts";
import type { ChangeRecord, TextContentChangeRecord } from "../changes/types.ts";
import { captureTextProjectionTarget, textProjectionSelector } from "../projection/textProjection.ts";
import type { TextProjectionScope, TextProjectionTarget } from "./textChangeBoundary.ts";

/** Binding and scope decisions, independent of native editor lifecycle state. */
export interface TextEditDecision {
  bindingIndex: number | null;
  scope: TextProjectionScope;
}

export function initialTextEditDecision(candidate: TextBindingCandidate): TextEditDecision {
  return {
    bindingIndex: candidate.bindingChoices?.length === 1 ? 0 : null,
    scope: candidate.scope ?? (candidate.binding.kind === "rendered-text" ? "rendered-instance" : "source-site"),
  };
}

export function chooseTextEditBinding(candidate: TextBindingCandidate, index: number): TextEditDecision | null {
  const choice = candidate.bindingChoices?.[index];
  if (!choice) return null;
  return {
    bindingIndex: index,
    scope: choice.mountedCount > 1 ? "rendered-instance" : "source-site",
  };
}

function selectedBinding(candidate: TextBindingCandidate, decision: TextEditDecision): TextBindingChoice | null {
  return decision.bindingIndex === null ? null : candidate.bindingChoices?.[decision.bindingIndex] ?? null;
}

export function getTextEditScopeChoices(
  candidate: TextBindingCandidate,
  decision: TextEditDecision,
): readonly TextProjectionScope[] {
  const choice = selectedBinding(candidate, decision);
  if (!choice) return candidate.scopeChoices ?? [];
  return choice.mountedCount > 1 && choice.authoredAs === "literal"
    ? ["rendered-instance", "source-site"]
    : [];
}

export function getTextEditBinding(
  candidate: TextBindingCandidate,
  decision: TextEditDecision,
  capturedTarget: TextProjectionTarget | null,
): TextEditBinding {
  const choice = selectedBinding(candidate, decision);
  if (!choice) return candidate.binding;
  if (choice.mountedCount > 1 && choice.authoredAs !== "literal") {
    const target = choice.renderedTarget ?? candidate.renderedTarget ?? capturedTarget;
    return target ? { kind: "rendered-text", target } : choice.binding;
  }
  return choice.binding;
}

function sourceForChoice(
  candidate: TextBindingCandidate,
  choice: TextBindingChoice | null,
): NonNullable<TextBindingCandidate["renderedSource"]> {
  if (choice?.renderedSource) return choice.renderedSource;
  if (candidate.renderedSource
    && (!choice || candidate.renderedSource.evidence?.callsiteId === choice.binding.target.callsiteId
      && candidate.renderedSource.evidence.property === choice.binding.property)) {
    return candidate.renderedSource;
  }
  const parsed = /^(.*):(\d+):(\d+)$/.exec(candidate.element.getAttribute("data-src") ?? "");
  const target = choice?.binding.target;
  const authoredAs = choice?.authoredAs === "literal"
    ? "literal"
    : choice?.authoredAs === "expression" || choice?.authoredAs === "spread"
      ? "expression"
      : "unknown";
  return {
    file: target?.file ?? parsed?.[1] ?? candidate.element.getAttribute("data-src") ?? "",
    line: target?.line ?? Number(parsed?.[2] ?? 0),
    column: target?.column ?? Number(parsed?.[3] ?? 0),
    component: target?.componentName ?? candidate.element.getAttribute("data-cid") ?? "Rendered text",
    selector: candidate.binding.kind === "rendered-text"
      ? textProjectionSelector(candidate.binding.target) ?? ""
      : "",
    authoredAs,
    evidence: choice ? {
      callsiteId: choice.binding.target.callsiteId,
      componentName: choice.binding.target.componentName,
      property: choice.binding.property,
      mountedCount: choice.mountedCount,
    } : undefined,
  };
}

function componentEvidence(
  candidate: TextBindingCandidate,
  choice: TextBindingChoice,
): ComponentInvocationEvidence {
  const target = choice.renderedTarget
    ?? candidate.renderedTarget
    ?? captureTextProjectionTarget(candidate.element, candidate.before, candidate.textNode);
  return {
    occurrence: target?.occurrence ?? 0,
    props: target?.props ?? candidate.element.getAttribute("data-cprops"),
    ariaLabel: target?.ariaLabel ?? candidate.element.getAttribute("aria-label"),
    beforeText: candidate.before,
    mountedCount: choice.mountedCount,
  };
}

function textTargetFor(
  candidate: TextBindingCandidate,
  binding: TextEditBinding,
  choice: TextBindingChoice | null,
): ReturnType<typeof captureTextProjectionTarget> {
  if (choice?.renderedTarget) return choice.renderedTarget;
  if (candidate.renderedTarget) return candidate.renderedTarget;
  if (binding.kind === "rendered-text") return binding.target;
  return captureTextProjectionTarget(candidate.element, candidate.before, candidate.textNode);
}

function choiceForCommit(candidate: TextBindingCandidate, selectedChoice: TextBindingChoice | null): TextBindingChoice | null {
  const choice = selectedChoice ?? candidate.bindingChoices?.[0];
  const target = candidate.editableTarget;
  if (choice || !target || candidate.mountedCount === undefined) return choice ?? null;
  const property = candidate.binding.kind === "component-prop"
    ? candidate.binding.property
    : "children";
  return {
    binding: candidate.binding.kind === "component-prop"
      ? candidate.binding
      : {
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
      },
    editableTarget: target,
    mountedCount: candidate.mountedCount,
    authoredAs: target.meta.authoredProps[property] ?? "default",
    renderedTarget: candidate.renderedTarget ?? null,
    renderedSource: candidate.renderedSource,
  };
}

/** Builds a canonical record without changing the DOM, appending history, or ending a draft. */
export function prepareTextEditChange(
  candidate: TextBindingCandidate,
  decision: TextEditDecision,
  capturedTarget: TextProjectionTarget | null,
  after: string,
): ChangeRecord | null {
  if ((candidate.bindingChoices?.length ?? 0) > 1 && decision.bindingIndex === null) return null;
  const binding = getTextEditBinding(candidate, decision, capturedTarget);
  const choice = choiceForCommit(candidate, selectedBinding(candidate, decision));
  if (binding.kind === "component-prop" && decision.scope === "source-site") {
    const editableTarget = choice?.editableTarget ?? candidate.editableTarget;
    const prop = editableTarget?.contract.props.find((item) =>
      item.name === binding.property && item.control === "text");
    if (!editableTarget || !prop) return null;
    return createComponentPropChange(editableTarget, prop, after, {
      scope: "source-site",
      evidence: choice && choice.mountedCount > 1
        ? componentEvidence(candidate, choice)
        : undefined,
    });
  }
  const textTarget = textTargetFor(candidate, binding, choice);
  const source = sourceForChoice(candidate, choice);
  const renderedSource = source.selector || !textTarget
    ? source
    : { ...source, selector: textProjectionSelector(textTarget) ?? "" };
  if (!textTarget || !renderedSource.selector) return null;
  return {
    kind: "text-content",
    id: `text-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    target: textTarget,
    source: {
      file: renderedSource.file,
      line: renderedSource.line,
      column: renderedSource.column,
      component: renderedSource.component,
    },
    selector: renderedSource.selector,
    before: candidate.before,
    after,
    authoredAs: renderedSource.authoredAs,
    scope: decision.scope,
    evidence: renderedSource.evidence,
  } satisfies TextContentChangeRecord;
}
