import { isComponentChange, isElementChange, isTextContentChange, isTokenChange } from "../changes/changesLog.ts";
import type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  PreviewableChangeRecord,
  TokenChangeRecord,
  TextContentChangeRecord,
} from "../changes/changesLog.ts";
import type { RenderedInstanceOverride, RenderedInstanceRef } from "../changes/editModel.ts";
import type { StructuralChange } from "../projection/structuralProjection.ts";
import type { TextProjectionTarget } from "../inline-text/textChangeBoundary.ts";
import { canonicalizeChanges, changeKey, tokenReference } from "../changes/model.ts";
import { getPreviewDiagnostic } from "../changes/previewDiagnostics.ts";
import {
  formatComponentPropBaseline,
  formatComponentPropValue,
} from "../componentSemantics/changeModel.ts";
import {
  boundRuntimeEvidence,
  isRuntimeGeneratedSource,
  normalizeRuntimeTag,
  normalizeRuntimeText,
} from "../runtime/staticHtmlRuntimeIdentity.ts";
import { getSourceCoordinatePolicy, type SourceCoordinatePolicy } from "../runtime/runtimeConfig.ts";
import { DEFAULT_CUSTOM_INSTRUCTIONS } from "./promptSettings.ts";

export interface FrameworkHints {
  framework?: string;
  stylingSystem?: string;
}

const EMPTY_SENTINEL =
  "<!-- No changes to export -->\n\nThe changes log is empty. Make a change in the Nudge UI inspector first.";

interface ElementGroup {
  key: string;
  cid: string;
  file: string;
  line: number;
  column: number;
  runtimeEvidence?: ElementChangeRecord["runtimeEvidence"];
  instanceOverride?: RenderedInstanceOverride;
  changes: ElementChangeRecord[];
}

interface PromptSection {
  heading: string;
  lines: string[];
}

function renderPrompt(
  sections: PromptSection[],
  customInstructions: string,
): string {
  const lines = [
    "# Requested design changes",
  ];

  for (const section of sections) {
    const content = [...section.lines];
    while (content.at(-1) === "") content.pop();
    lines.push("", `## ${section.heading}`, "", ...content);
  }

  const instructions = customInstructions.trim();
  if (instructions) {
    lines.push("", "## Custom instructions", "", instructions);
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
  const result = getPreviewDiagnostic(changeKey(rec))?.result;
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

function boundedEvidence(value: string | null): string | null {
  return boundRuntimeEvidence(value);
}

function sourceSiteLabel(ref: RenderedInstanceRef): string {
  if (isRuntimeGeneratedSource(ref.sourceSite.src)) {
    return `${ref.sourceSite.cid} (source unknown; runtime-created DOM)`;
  }
  return `${ref.sourceSite.cid} (${ref.sourceSite.src})`;
}

/** Compare durable rendered-instance identity without child-text evidence. */
function structuralParentIdentityKey(ref: RenderedInstanceRef): string {
  const { sourceSite, locator } = ref;
  return JSON.stringify([
    sourceSite.cid,
    sourceSite.src,
    locator.occurrence,
    locator.props,
    locator.ariaLabel ?? null,
  ]);
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

/**
 * Coordinate precision follows each element's identity origin, not the
 * document's framework hint (ADR-0011 Stage 5). The active host Adapter
 * declares which origins carry exact authored coordinates through the
 * runtime configuration; hosts that declare nothing are exact everywhere.
 */
function hasExactAuthoredCoordinates(
  policy: SourceCoordinatePolicy | null,
  cid: string | undefined,
  file: string,
): boolean {
  if (policy === null) return true;
  if (cid !== undefined && policy.exactCidPrefixes.some((prefix) => cid.startsWith(prefix))) {
    return true;
  }
  return policy.exactFileExtensions.some((extension) => file.endsWith(extension));
}

/**
 * Formats one source location for a prompt heading. Exact origins keep the
 * authored column; line-only origins — and sites whose column is unknown —
 * degrade to `file:line` rather than fabricating precision.
 */
function formatSourceLocation(
  policy: SourceCoordinatePolicy | null,
  source: { cid?: string; file: string; line: number; column: number },
): string {
  if (hasExactAuthoredCoordinates(policy, source.cid, source.file) && source.column > 0) {
    return `${source.file}:${source.line}:${source.column}`;
  }
  return `${source.file}:${source.line}`;
}

function elementGroupSource(
  group: ElementGroup,
  policy: SourceCoordinatePolicy | null,
): string {
  if (group.runtimeEvidence) {
    return group.runtimeEvidence.reason === "unannotated"
      ? "source unknown; no authored location available"
      : "source unknown; runtime-created DOM";
  }
  return formatSourceLocation(policy, group);
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
  const sourceParent = sourceSiteLabel(change.source.parent);
  const destinationParent = sourceSiteLabel(change.destination.parent);
  if (structuralParentIdentityKey(change.source.parent) !== structuralParentIdentityKey(change.destination.parent)) {
    return before
      ? `- Move ${target} from ${sourceParent} into ${destinationParent}, before ${renderedInstanceDescription(before)}.`
      : `- Move ${target} from ${sourceParent} into ${destinationParent}, at the end.`;
  }
  return before
    ? `- Move ${target} before ${renderedInstanceDescription(before)} in ${destinationParent}.`
    : `- Move ${target} to the end of ${destinationParent}.`;
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

  changes.forEach((change, index) => {
    const targetKey = renderedInstanceKey(change.target);
    const history = historyByTarget.get(targetKey) ?? { changes: [], lastIndex: index };
    history.changes.push(change);
    history.lastIndex = index;
    historyByTarget.set(targetKey, history);

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
    const first = moves[0];
    const onlyTargetMoves = changes.every((candidate) => candidate.kind === "move"
      && renderedInstanceKey(candidate.target) === targetKey);
    const returnedToStart = moves.length > 1
      && onlyTargetMoves
      && first
      && structuralParentIdentityKey(first.source.parent) === structuralParentIdentityKey(latest.destination.parent)
      && first.presentation.fromIndex === latest.presentation.toIndex;
    if (returnedToStart) continue;

    // The final destination is the useful handoff. Keep the first source
    // context when the gesture crossed intermediate containers so the prompt
    // describes the authored move rather than the drag history.
    if (first && first !== latest && latest.kind === "move") {
      canonical.push({
        ...latest,
        source: first.source,
        presentation: {
          ...latest.presentation,
          sourceParentTag: first.presentation.sourceParentTag,
          fromIndex: first.presentation.fromIndex,
        },
      });
    } else {
      canonical.push(latest);
    }
  }
  return canonical;
}

export function generatePrompt(
  changes: ChangeRecord[],
  frameworkHints?: FrameworkHints,
  structuralChanges: readonly StructuralChange[] = [],
  customInstructions: string = DEFAULT_CUSTOM_INSTRUCTIONS,
): string {
  const deduplicated = canonicalizeChanges(changes);
  const structuralIntent = canonicalizeStructuralChanges(structuralChanges);
  if (deduplicated.length === 0 && structuralIntent.length === 0) return EMPTY_SENTINEL;

  const tokenChanges = deduplicated.filter(isTokenChange);
  const componentChanges = deduplicated.filter(isComponentChange);
  const textChanges = deduplicated.filter(isTextContentChange);
  const elementChanges = deduplicated.filter(isElementChange);
  const elementGroups = groupElementChanges(elementChanges);
  const coordinatePolicy = getSourceCoordinatePolicy();
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
      const source = formatSourceLocation(coordinatePolicy, target);
      lines.push(`### ${target.componentName} invocation (${source})`);
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
      lines.push(`### ${group.cid} (${elementGroupSource(group, coordinatePolicy)}) · ${state}`);
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
      const runtimeCreated = isRuntimeGeneratedSource(change.target.sourceSite.src);
      const textSource = runtimeCreated
        ? "source unknown; runtime-created DOM"
        : formatSourceLocation(coordinatePolicy, {
          cid: change.target.sourceSite.cid,
          file: change.source.file,
          line: change.source.line,
          column: change.source.column,
        });
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

  return renderPrompt(sections, customInstructions);
}
