import { isComponentChange, isTextContentChange, isTokenChange } from "../changesLog.ts";
import type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  PreviewableChangeRecord,
  TokenChangeRecord,
  TextContentChangeRecord,
} from "../changesLog.ts";
import { escapeAttrValue } from "../cssEscapes.ts";
import type { RenderedInstanceOverride, RenderedInstanceRef } from "../renderedInstance.ts";
import type { StructuralChange } from "../structuralProjection.ts";
import type { TextProjectionTarget } from "../textChangeBoundary.ts";
import { canonicalizeChanges, tokenReference } from "../changes/model.ts";
import {
  formatComponentPropBaseline,
  formatComponentPropValue,
} from "../componentSemantics/changeModel.ts";
import {
  boundRuntimeEvidence,
  isRuntimeGeneratedSource,
  normalizeRuntimeTag,
  normalizeRuntimeText,
} from "../staticHtmlRuntimeIdentity.ts";

export interface FrameworkHints {
  framework?: string;
  stylingSystem?: string;
  /** Host Adapter label; names the framework line for multi-host prompts. */
  host?: string;
}

const EMPTY_SENTINEL =
  "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Design Tool inspector first.";

interface ElementGroup {
  key: string;
  cid: string;
  file: string;
  line: number;
  column: number;
  selector: string;
  runtimeEvidence?: ElementChangeRecord["runtimeEvidence"];
  instanceOverride?: RenderedInstanceOverride;
  changes: ElementChangeRecord[];
}

interface PromptSection {
  heading: string;
  lines: string[];
}

function renderPrompt(sections: PromptSection[]): string {
  const lines = [
    "# Requested design changes",
    "",
    "Implementation guidance: Preserve existing tokens, logical properties, and CSS intent while applying these rendered changes.",
  ];

  for (const section of sections) {
    const content = [...section.lines];
    while (content.at(-1) === "") content.pop();
    lines.push("", `## ${section.heading}`, "", ...content);
  }

  return lines.join("\n");
}

function groupElementChanges(changes: ElementChangeRecord[]): ElementGroup[] {
  const map = new Map<string, ElementGroup>();
  for (const change of changes) {
    const instanceOverride = change.scope === "rendered-instance" ? change.instanceOverride : undefined;
    const key = [
      change.cid,
      change.file,
      change.line,
      change.selector,
      change.scope ?? "source-site",
      instanceOverride?.id ?? "",
      instanceOverride ? JSON.stringify(instanceOverride.target) : "",
      change.state ?? "base",
    ].join("\u0000");
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        cid: change.cid,
        file: change.file,
        line: change.source.line || change.line,
        column: change.column ?? 0,
        selector: change.selector,
        runtimeEvidence: change.runtimeEvidence,
        instanceOverride,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return [...map.values()];
}

function conflictSuffix(rec: PreviewableChangeRecord): string {
  const result = rec.previewResult;
  if (!result || result.status === "applied") return "";
  return ` — preview conflict: browser computed \`${result.computedValue || "(no value)"}\` (${result.reason ?? "cascade conflict"}); implement the requested value without assuming \`!important\``;
}

function elementChangeLine(rec: ElementChangeRecord): string {
  if (rec.newToken && rec.oldToken) {
    return `- \`${rec.property}\`: \`${rec.oldToken.name}\` → \`${rec.newToken.name}\`${conflictSuffix(rec)}`;
  }
  if (rec.newToken) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    // Describe exactly the value the managed stylesheet wrote for this swap
    // (adapter literal or var(cssName)); a bare var(name) would be invalid
    // CSS for adapter tokens whose names are not custom-property names.
    return `- \`${rec.property}\`: ${before}\`${tokenReference(rec.newToken)}\`${conflictSuffix(rec)}`;
  }
  if (rec.rawValue !== undefined) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    return `- \`${rec.property}\`: ${before}\`${rec.rawValue}\`${conflictSuffix(rec)}`;
  }
  return `- \`${rec.property}\`: (no value)`;
}

function sourceIntentLine(rec: ElementChangeRecord): string | null {
  if (!rec.sourceProperty || rec.sourceProperty === rec.property) return null;
  const authored = rec.sourceAuthoredValue ? `: ${rec.sourceAuthoredValue}` : "";
  return `  - Source declaration (CSSOM): \`${rec.sourceProperty}${authored}\`; preview edit uses physical \`${rec.property}\``;
}

function tokenChangeLine(rec: TokenChangeRecord): string {
  return `- \`${rec.tokenName}\` (${rec.contextLabel}, ${rec.file}:${rec.line}): \`${rec.oldRawValue}\` → \`${rec.rawValue}\`${conflictSuffix(rec)}`;
}

function componentChangeLine(rec: ComponentChangeRecord): string {
  const sourceGuidance = rec.authoredAs === "literal"
    ? rec.property === "children"
      ? "replace the literal child text"
      : "replace the invocation prop literal"
    : rec.authoredAs === "default"
      ? "add the prop at this invocation"
      : `preserve the authored ${rec.authoredAs} and update its source logic`;
  const scope = rec.scope === "rendered-instance"
    ? "this rendered item only"
    : "all outputs at this source site";
  return `- \`${rec.property}\`: \`${formatComponentPropBaseline(rec.before)}\` → \`${formatComponentPropValue(rec.after)}\` — ${sourceGuidance}; scope: ${scope}`;
}

function textAuthorshipGuidance(authoredAs: TextContentChangeRecord["authoredAs"]): string {
  if (authoredAs === "literal") return "replace the authored literal text";
  if (authoredAs === "expression") return "preserve the expression and update its source logic";
  return "update the source that produces this rendered copy";
}

/** Keep arbitrary rendered copy valid inside the Markdown prompt. */
function promptText(value: string): string {
  if (!/[`~\r\n]/.test(value)) return `\`${value}\``;
  const longestTildeRun = Math.max(...(value.match(/~+/g) ?? [""]).map((run) => run.length));
  const fence = "~".repeat(Math.max(3, longestTildeRun + 1));
  return `${fence}text\n${value}\n${fence}`;
}

function textProjectionSourceFallback(target: TextProjectionTarget): string {
  return `[data-cid="${escapeAttrValue(target.sourceSite.cid)}"][data-src="${escapeAttrValue(target.sourceSite.src)}"]`;
}

function textEvidenceLines(target: TextProjectionTarget): string[] {
  const sourceLabel = isRuntimeGeneratedSource(target.sourceSite.src)
    ? `${target.sourceSite.cid} (source unknown; runtime-created DOM)`
    : `${target.sourceSite.cid} (\`${target.sourceSite.src}\`)`;
  const lines = [
    `  - Source site: ${sourceLabel}`,
  ];
  const props = boundRuntimeEvidence(target.props);
  const ariaLabel = boundRuntimeEvidence(target.ariaLabel);
  if (props) lines.push(`  - Props evidence: ${promptText(props)}`);
  if (ariaLabel) lines.push(`  - Accessible name evidence: ${promptText(ariaLabel)}`);
  return lines;
}

function textScopeLines(change: TextContentChangeRecord): string[] {
  const scope = change.scope === "source-site" ? "source site / all outputs" : "this rendered item only";
  const lines = [`  - Scope: ${scope}`];
  if (change.evidence) {
    lines.push(`  - Semantic evidence: \`${change.evidence.componentName}.${change.evidence.property}\` at callsite \`${change.evidence.callsiteId}\` (${change.evidence.mountedCount} mounted outputs)`);
  }
  return lines;
}

/**
 * Managed rules use an exact source identity. Prompts deliberately keep the
 * source-line form: it is more useful to an agent as a grep fallback and is
 * not used to apply browser styles.
 */
function promptSelectorForElement(group: ElementGroup, exactSource: boolean): string {
  if (exactSource) return group.selector;
  if (!group.cid || !group.file || !group.line) return group.selector;
  return `[data-cid="${escapeAttrValue(group.cid)}"][data-src*="${escapeAttrValue(`${group.file}:${group.line}`)}"]`;
}

function boundedEvidence(value: string | null): string | null {
  return boundRuntimeEvidence(value);
}

function sourceSiteLabel(ref: RenderedInstanceRef): string {
  if (isRuntimeGeneratedSource(ref.sourceSite.src)) {
    return `${ref.sourceSite.cid} (source unknown; runtime-created DOM)`;
  }
  return `${ref.sourceSite.cid} (${ref.sourceSite.src})`;
}

function runtimeEvidenceLines(group: ElementGroup): string[] {
  const evidence = group.runtimeEvidence;
  if (!evidence) return [];
  const tagName = normalizeRuntimeTag(evidence.tagName) || "unknown";
  const text = normalizeRuntimeText(evidence.text);
  const ariaLabel = boundRuntimeEvidence(evidence.ariaLabel);
  const props = boundRuntimeEvidence(evidence.props);
  const lines = [
    "  - Source: unknown; locate the JavaScript or template that creates this runtime DOM.",
    `  - Rendered element: \`<${tagName}>\``,
  ];
  if (text) lines.push(`  - Text evidence: ${promptText(text)}`);
  if (ariaLabel) lines.push(`  - Accessible name evidence: ${promptText(ariaLabel)}`);
  if (props) lines.push(`  - Props evidence: ${promptText(props)}`);
  return lines;
}

function elementGroupSource(group: ElementGroup, exactSource: boolean): string {
  if (group.runtimeEvidence) return "source unknown; runtime-created DOM";
  if (exactSource && group.column > 0) return `${group.file}:${group.line}:${group.column}`;
  return `${group.file}:${group.line}`;
}

function renderedInstanceDescription(ref: RenderedInstanceRef): string {
  const text = boundedEvidence(ref.locator.text);
  const ariaLabel = boundedEvidence(ref.locator.ariaLabel ?? null);
  const props = boundedEvidence(ref.locator.props);
  const source = isRuntimeGeneratedSource(ref.sourceSite.src)
    ? sourceSiteLabel(ref)
    : ref.sourceSite.src;

  if (text) return `text ${promptText(text)} (${source})`;
  if (ariaLabel) return `the element named ${promptText(ariaLabel)} (${source})`;
  if (props) return `the element with props ${promptText(props)} (${source})`;

  // With no semantic evidence, the ordinal is the only way to distinguish
  // repeated outputs from the same source site.
  return `rendered instance ${ref.locator.occurrence + 1} of ${sourceSiteLabel(ref)}`;
}

function structuralChangeLine(change: StructuralChange): string {
  const target = renderedInstanceDescription(change.target);
  if (change.kind === "delete") {
    return `- Remove ${target} from the source.`;
  }
  const before = change.destination.before;
  const parent = sourceSiteLabel(change.destination.parent);
  return before
    ? `- Move ${target} before ${renderedInstanceDescription(before)} in ${parent}.`
    : `- Move ${target} to the end of ${parent}.`;
}

function renderedInstanceKey(ref: RenderedInstanceRef): string {
  const { sourceSite, locator } = ref;
  return JSON.stringify([
    sourceSite.cid,
    sourceSite.src,
    locator.props,
    locator.text,
    locator.ariaLabel ?? null,
  ]);
}

/** Export final intent, not the gesture history required to replay the preview. */
function canonicalizeStructuralChanges(changes: readonly StructuralChange[]): StructuralChange[] {
  const historyByTarget = new Map<string, { changes: StructuralChange[]; lastIndex: number }>();
  const movedTargetsByParent = new Map<string, Set<string>>();

  changes.forEach((change, index) => {
    const targetKey = renderedInstanceKey(change.target);
    const history = historyByTarget.get(targetKey) ?? { changes: [], lastIndex: index };
    history.changes.push(change);
    history.lastIndex = index;
    historyByTarget.set(targetKey, history);

    if (change.kind === "move") {
      const parentKey = renderedInstanceKey(change.destination.parent);
      const targets = movedTargetsByParent.get(parentKey) ?? new Set<string>();
      targets.add(targetKey);
      movedTargetsByParent.set(parentKey, targets);
    }
  });

  const canonical: StructuralChange[] = [];
  const histories = [...historyByTarget.entries()]
    .sort(([, a], [, b]) => a.lastIndex - b.lastIndex);
  for (const [targetKey, history] of histories) {
    const latest = history.changes.at(-1)!;
    if (latest.kind === "delete") {
      canonical.push(latest);
      continue;
    }
    const moves = history.changes.filter((change): change is Extract<StructuralChange, { kind: "move" }> =>
      change.kind === "move");
    const parentKeys = new Set(moves.map((move) => renderedInstanceKey(move.destination.parent)));
    const parentKey = parentKeys.size === 1 ? [...parentKeys][0]! : null;
    const returnedToStart = parentKey !== null
      && movedTargetsByParent.get(parentKey)?.size === 1
      && moves[0]?.presentation.fromIndex === latest.presentation.toIndex;
    if (!returnedToStart) canonical.push(latest);
  }
  return canonical;
}

function structuralSourceFallback(ref: RenderedInstanceRef, exactSource: boolean): string {
  const operator = exactSource ? "=" : "*=";
  return `[data-cid="${escapeAttrValue(ref.sourceSite.cid)}"][data-src${operator}"${escapeAttrValue(ref.sourceSite.src)}"]`;
}

export function generatePrompt(
  changes: ChangeRecord[],
  frameworkHints?: FrameworkHints,
  structuralChanges: readonly StructuralChange[] = [],
): string {
  const deduplicated = canonicalizeChanges(changes);
  const structuralIntent = canonicalizeStructuralChanges(structuralChanges);
  if (deduplicated.length === 0 && structuralIntent.length === 0) return EMPTY_SENTINEL;

  const tokenChanges = deduplicated.filter(isTokenChange);
  const componentChanges = deduplicated.filter(isComponentChange);
  const textChanges = deduplicated.filter(isTextContentChange);
  const elementChanges = deduplicated.filter((change): change is ElementChangeRecord =>
    !isTokenChange(change) && !isComponentChange(change) && !isTextContentChange(change));
  const elementGroups = groupElementChanges(elementChanges);
  const framework = frameworkHints?.framework ?? "React";
  const exactHtmlSource = framework === "HTML";
  const sections: PromptSection[] = [];

  if (tokenChanges.length > 0) {
    sections.push({
      heading: "Global token changes",
      lines: tokenChanges.map(tokenChangeLine),
    });
  }

  if (componentChanges.length > 0) {
    const lines: string[] = [];
    for (const change of componentChanges) {
      const target = change.target;
      lines.push(`### ${target.componentName} invocation (${target.file}:${target.line}:${target.column})`);
      lines.push(componentChangeLine(change));
      lines.push(`  - Component contract: \`${target.componentId}\``);
      if (change.evidence) {
        lines.push(`  - Rendered evidence: ${change.evidence.mountedCount} mounted outputs`);
        if (change.evidence.props) lines.push(`    - Props evidence: ${promptText(boundedEvidence(change.evidence.props) ?? "")}`);
        if (change.evidence.ariaLabel) lines.push(`    - Accessible name evidence: ${promptText(boundedEvidence(change.evidence.ariaLabel) ?? "")}`);
        lines.push(`    - Before text: ${promptText(change.evidence.beforeText)}`);
      }
      lines.push("");
    }
    sections.push({ heading: "Component prop changes", lines });
  }

  if (elementGroups.length > 0) {
    const lines: string[] = [];
    for (const group of elementGroups) {
      const state = group.changes[0]?.state ?? "base";
      lines.push(`### ${group.cid} (${elementGroupSource(group, exactHtmlSource)}) · ${state}`);
      if (group.instanceOverride) {
        lines.push(`- Applies only to ${renderedInstanceDescription(group.instanceOverride.target)}.`);
      }
      lines.push(...runtimeEvidenceLines(group));
      for (const change of group.changes) {
        lines.push(elementChangeLine(change));
        const intent = sourceIntentLine(change);
        if (intent) lines.push(intent);
      }
      lines.push("");
    }
    sections.push({ heading: "Changes", lines });
  }

  if (textChanges.length > 0) {
    const lines: string[] = [];
    for (const change of textChanges) {
      const textSource = isRuntimeGeneratedSource(change.target.sourceSite.src)
        ? "source unknown; runtime-created DOM"
        : `${change.source.file}:${change.source.line}:${change.source.column}`;
      lines.push(`### ${change.source.component || change.target.sourceSite.cid} (${textSource})`);
      lines.push(`- Rendered text: ${promptText(change.before)} → ${promptText(change.after)} — ${textAuthorshipGuidance(change.authoredAs)}`);
      lines.push(...textScopeLines(change));
      lines.push(...textEvidenceLines(change.target));
      lines.push("");
    }
    sections.push({ heading: "Rendered text changes", lines });
  }

  if (structuralIntent.length > 0) {
    sections.push({
      heading: "Structural changes",
      lines: structuralIntent.map(structuralChangeLine),
    });
  }

  const fallbackLines = new Set<string>();
  tokenChanges.forEach((change) => fallbackLines.add(`- \`${change.tokenName}\` in \`${change.selector}\``));
  componentChanges.forEach((change) =>
    fallbackLines.add(`- Component callsite: \`${change.target.file}:${change.target.line}:${change.target.column}\` (\`${change.target.componentName}\`)`));
  componentChanges.forEach((change) =>
    fallbackLines.add(`- \`[data-cid="${escapeAttrValue(change.target.componentName)}"][data-src*="${escapeAttrValue(`${change.target.file}:${change.target.line}`)}"]\``));
  textChanges.forEach((change) => fallbackLines.add(`- \`${textProjectionSourceFallback(change.target)}\``));
  elementGroups.forEach((group) => fallbackLines.add(`- \`${promptSelectorForElement(group, exactHtmlSource)}\``));
  const structuralFallbacks = new Set<string>();
  for (const change of structuralIntent) {
    structuralFallbacks.add(structuralSourceFallback(change.target, exactHtmlSource));
  }
  structuralFallbacks.forEach((selector) => fallbackLines.add(`- \`${selector}\``));
  sections.push({ heading: "Selectors (fallback)", lines: [...fallbackLines] });

  return renderPrompt(sections);
}
