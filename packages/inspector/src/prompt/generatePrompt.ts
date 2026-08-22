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
import { canonicalizeChanges } from "../changes/model.ts";
import {
  formatComponentPropBaseline,
  formatComponentPropValue,
} from "../componentSemantics/changeModel.ts";
import { presentChange } from "../changes/presentation.ts";
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

/** Human-readable host labels keyed by DesignToolRuntimeHost. */
const HOST_LABELS: Record<string, string> = {
  "vite-react": "Vite",
  "static-html": "Static HTML",
  "nextjs-react": "Next.js (App Router)",
};

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

function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash >= 0 ? filePath.slice(slash + 1) : filePath;
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
    return `- \`${rec.property}\`: ${before}\`var(${rec.newToken.name})\` (promoted from raw value — consider adding a dedicated token)${conflictSuffix(rec)}`;
  }
  if (rec.rawValue !== undefined) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    return `- \`${rec.property}\`: ${before}\`${rec.rawValue}\` (not a token — consider adding one)${conflictSuffix(rec)}`;
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
    `  - Rendered occurrence: ${target.occurrence + 1}`,
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

function instanceEvidenceLines(label: string, ref: RenderedInstanceRef): string[] {
  const evidence = ref.locator;
  const lines = [`  - ${label}: ${sourceSiteLabel(ref)}; rendered occurrence ${evidence.occurrence + 1}`];
  const props = boundedEvidence(evidence.props);
  const text = boundedEvidence(evidence.text);
  const ariaLabel = boundedEvidence(evidence.ariaLabel ?? null);
  if (props) lines.push(`    - Props evidence: \`${props}\``);
  if (text) lines.push(`    - Text evidence: \`${text}\``);
  if (ariaLabel) lines.push(`    - Accessible name evidence: \`${ariaLabel}\``);
  return lines;
}

function structuralChangeLines(change: StructuralChange): string[] {
  if (change.kind === "delete") {
    return [
      `### Remove rendered instance from ${sourceSiteLabel(change.target)}`,
      "- Remove this one rendered instance in source; do not implement a runtime DOM deletion.",
      ...instanceEvidenceLines("Target", change.target),
    ];
  }
  const before = change.destination.before;
  return [
    `### Move rendered instance from ${sourceSiteLabel(change.target)}`,
    before
      ? `- Move this one rendered instance before the specified sibling within ${sourceSiteLabel(change.destination.parent)}.`
      : `- Move this one rendered instance to the end of ${sourceSiteLabel(change.destination.parent)}.`,
    ...instanceEvidenceLines("Target", change.target),
    ...instanceEvidenceLines("Destination parent", change.destination.parent),
    ...(before ? instanceEvidenceLines("Before anchor", before) : []),
    `  - Presentation: position ${change.presentation.fromIndex + 1} → ${change.presentation.toIndex + 1} within <${change.presentation.parentTag}>`,
  ];
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
  if (changes.length === 0 && structuralChanges.length === 0) return EMPTY_SENTINEL;
  const deduplicated = canonicalizeChanges(changes);
  if (deduplicated.length === 0 && structuralChanges.length === 0) return EMPTY_SENTINEL;

  const tokenChanges = deduplicated.filter(isTokenChange);
  const componentChanges = deduplicated.filter(isComponentChange);
  const textChanges = deduplicated.filter(isTextContentChange);
  const elementChanges = deduplicated.filter((change): change is ElementChangeRecord =>
    !isTokenChange(change) && !isComponentChange(change) && !isTextContentChange(change));
  const elementGroups = groupElementChanges(elementChanges);
  const firstFile = (deduplicated[0]
    ? presentChange(deduplicated[0]).file
    : structuralChanges[0]!.target.sourceSite.src) || "runtime-created DOM";
  const framework = frameworkHints?.framework ?? "React";
  const stylingSystem = frameworkHints?.stylingSystem ?? "CSS custom properties";
  const hostLabel = frameworkHints?.host
    ? HOST_LABELS[frameworkHints.host] ?? frameworkHints.host
    : null;
  const frameworkLine = hostLabel
    ? `${framework} on ${hostLabel} + ${stylingSystem}`
    : `${framework} + ${stylingSystem}`;
  const exactHtmlSource = framework === "HTML";
  const lines = [
    `# Design changes for ${basename(firstFile)}`,
    "",
    `Framework: ${frameworkLine}`,
    "",
    "Implementation guidance: Preserve existing tokens, logical properties, and CSS intent while applying these rendered changes.",
    "",
  ];

  if (tokenChanges.length > 0) {
    lines.push("## Global token changes", "");
    tokenChanges.forEach((change) => lines.push(tokenChangeLine(change)));
    lines.push("");
  }

  if (componentChanges.length > 0) {
    lines.push("## Component prop changes", "");
    for (const change of componentChanges) {
      const target = change.target;
      lines.push(`### ${target.componentName} invocation (${target.file}:${target.line}:${target.column})`);
      lines.push(componentChangeLine(change));
      lines.push(`  - Component contract: \`${target.componentId}\``);
      if (change.evidence) {
        lines.push(`  - Rendered evidence: occurrence ${change.evidence.occurrence + 1}; mounted outputs ${change.evidence.mountedCount}`);
        if (change.evidence.props) lines.push(`    - Props evidence: ${promptText(boundedEvidence(change.evidence.props) ?? "")}`);
        if (change.evidence.ariaLabel) lines.push(`    - Accessible name evidence: ${promptText(boundedEvidence(change.evidence.ariaLabel) ?? "")}`);
        lines.push(`    - Before text: ${promptText(change.evidence.beforeText)}`);
      }
      lines.push("");
    }
  }

  if (elementGroups.length > 0) {
    lines.push("## Changes", "");
    for (const group of elementGroups) {
      const state = group.changes[0]?.state ?? "base";
      lines.push(`### ${group.cid} (${elementGroupSource(group, exactHtmlSource)}) · ${state}`);
      if (group.instanceOverride) {
        lines.push(...instanceEvidenceLines("Target", group.instanceOverride.target));
      }
      lines.push(...runtimeEvidenceLines(group));
      for (const change of group.changes) {
        lines.push(elementChangeLine(change));
        const intent = sourceIntentLine(change);
        if (intent) lines.push(intent);
      }
      lines.push("");
    }
  }

  if (textChanges.length > 0) {
    lines.push("## Rendered text changes", "");
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
  }

  if (structuralChanges.length > 0) {
    lines.push("## Structural preview changes", "");
    for (const change of structuralChanges) {
      lines.push(...structuralChangeLines(change));
      lines.push("");
    }
  }

  lines.push("## Selectors (fallback)");
  tokenChanges.forEach((change) => lines.push(`- \`${change.tokenName}\` in \`${change.selector}\``));
  componentChanges.forEach((change) =>
    lines.push(`- Component callsite: \`${change.target.file}:${change.target.line}:${change.target.column}\` (\`${change.target.componentName}\`)`));
  componentChanges.forEach((change) =>
    lines.push(`- \`[data-cid="${escapeAttrValue(change.target.componentName)}"][data-src*="${escapeAttrValue(`${change.target.file}:${change.target.line}`)}"]\``));
  textChanges.forEach((change) => lines.push(`- \`${textProjectionSourceFallback(change.target)}\``));
  elementGroups.forEach((group) => lines.push(`- \`${promptSelectorForElement(group, exactHtmlSource)}\``));
  const structuralFallbacks = new Set<string>();
  for (const change of structuralChanges) {
    structuralFallbacks.add(structuralSourceFallback(change.target, exactHtmlSource));
    if (change.kind === "move") {
      structuralFallbacks.add(structuralSourceFallback(change.destination.parent, exactHtmlSource));
      if (change.destination.before) structuralFallbacks.add(structuralSourceFallback(change.destination.before, exactHtmlSource));
    }
  }
  structuralFallbacks.forEach((selector) => lines.push(`- \`${selector}\``));
  return lines.join("\n");
}
