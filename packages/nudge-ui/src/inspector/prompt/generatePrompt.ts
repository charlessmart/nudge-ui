import { isComponentChange, isElementChange, isTextContentChange, isTokenChange } from "../changes/types.ts";
import type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  TokenChangeRecord,
  TextContentChangeRecord,
} from "../changes/types.ts";
import type { RenderedInstanceOverride, RenderedInstanceRef } from "../changes/editModel.ts";
import type { StructuralChange } from "../projection/structuralProjection.ts";
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
} from "../runtime/staticHtmlRuntimeIdentity.ts";
import { getSourceCoordinatePolicy, type SourceCoordinatePolicy } from "../runtime/runtimeConfig.ts";
import type { AgentSketchMetadata } from "../agent/protocol.ts";
import { DEFAULT_CUSTOM_INSTRUCTIONS } from "./promptSettings.ts";
import { PROMPT_TITLE } from "./promptDocument.ts";

import { getCommentsForTarget, type ElementComment } from "../comments/store.ts";
import { documentTarget } from "../drafts/model.ts";

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
  sourceEvidence?: ElementChangeRecord["sourceEvidence"];
  instanceOverride?: RenderedInstanceOverride;
  changes: ElementChangeRecord[];
}

interface PromptSection {
  heading: string;
  lines: string[];
}

interface ElementPromptGroup extends PromptSection {
  readonly details: Set<string>;
}

/** Labels describe the observed tag, without guessing its role in the page. */
function elementLabel(tag: string): string {
  const normalized = normalizeRuntimeTag(tag);
  const labels: Readonly<Record<string, string>> = {
    p: "Paragraph", button: "Button", a: "Link", img: "Image", input: "Input",
    textarea: "Text area", select: "Select", form: "Form", nav: "Navigation", section: "Section",
  };
  const label = /^h[1-6]$/.test(normalized) ? "Heading" : labels[normalized] ?? "Element";
  return normalized ? `${label} (${promptText(`<${normalized}>`)})` : label;
}

/** Runtime IDs identify one DOM element; authored sites can render several items. */
function elementPromptKey(
  cid: string,
  src: string,
  scope: "source-site" | "rendered-instance",
  locator?: RenderedInstanceRef["locator"],
): string {
  if (!src || isRuntimeGeneratedSource(src)) return JSON.stringify(["runtime", cid]);
  return JSON.stringify([cid, src, scope, scope === "rendered-instance" ? [
    locator?.occurrence, locator?.props, locator?.ariaLabel ?? null, locator?.invocation?.callsiteId ?? null,
  ] : null]);
}

function refPromptKey(ref: RenderedInstanceRef): string {
  return elementPromptKey(ref.sourceSite.cid, ref.sourceSite.src, "rendered-instance", ref.locator);
}

function renderPrompt(
  sections: PromptSection[],
  customInstructions: string,
): string {
  const lines = [
    PROMPT_TITLE,
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
        sourceEvidence: change.sourceEvidence,
        instanceOverride,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return [...map.values()];
}

function elementChangeLine(rec: ElementChangeRecord): string {
  const state = rec.state && rec.state !== "base" ? ` (${rec.state})` : "";
  const property = `\`${rec.property}\`${state}`;
  if (rec.newToken && rec.oldToken) {
    return `- **Change:** ${property}: \`${rec.oldToken.name}\` → \`${rec.newToken.name}\``;
  }
  if (rec.newToken) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    // Adapter token names are not always custom-property names, so emit the literal the stylesheet wrote.
    return `- **Change:** ${property}: ${before}\`${tokenReference(rec.newToken)}\``;
  }
  if (rec.rawValue !== undefined) {
    const before = rec.oldRawValue !== undefined ? `\`${rec.oldRawValue}\` → ` : "";
    return `- **Change:** ${property}: ${before}\`${rec.rawValue}\``;
  }
  return `- **Change:** ${property}: (no value)`;
}

function sourceIntentLine(rec: ElementChangeRecord): string | null {
  if (!rec.sourceProperty || rec.sourceProperty === rec.property) return null;
  const authored = rec.sourceAuthoredValue ? `: ${rec.sourceAuthoredValue}` : "";
  return `  - Source declaration (CSSOM): \`${rec.sourceProperty}${authored}\`; preview edit uses physical \`${rec.property}\``;
}

function tokenChangeLine(rec: TokenChangeRecord): string {
  return `- **Change:** \`${rec.tokenName}\` (${rec.contextLabel}, ${rec.file}:${rec.line}): \`${rec.oldRawValue}\` → \`${rec.rawValue}\``;
}

function componentChangeLine(rec: ComponentChangeRecord): string {
  const sourceGuidance = rec.authoredAs === "literal"
    ? rec.property === "children"
      ? "replace the literal child text"
      : ""
    : rec.authoredAs === "default"
      ? "add the prop at this invocation"
      : `preserve the authored ${rec.authoredAs} and update its source logic`;
  return `- **Change:** \`${rec.property}\`: \`${formatComponentPropBaseline(rec.before)}\` → \`${formatComponentPropValue(rec.after)}\`${sourceGuidance ? ` — ${sourceGuidance}` : ""}`;
}

function editScopeLine(scope: "source-site" | "rendered-instance"): string {
  return scope === "rendered-instance"
    ? "  - Apply to this selected item only; keep other instances unchanged."
    : "  - Apply to all items rendered at this source location.";
}

/** Keep arbitrary rendered copy valid inside the Markdown prompt. */
function promptText(value: string): string {
  if (!/[`~\r\n]/.test(value)) return `\`${value}\``;
  const longestTildeRun = Math.max(...(value.match(/~+/g) ?? [""]).map((run) => run.length));
  const fence = "~".repeat(Math.max(3, longestTildeRun + 1));
  return `${fence}text\n${value}\n${fence}`;
}

function textBindingLines(change: TextContentChangeRecord, sourceLocation: string | null): string[] {
  const lines: string[] = [];
  if (change.evidence) {
    const evidence = change.evidence;
    const location = evidence.callsiteId === sourceLocation ? "" : ` at ${promptText(evidence.callsiteId)}`;
    lines.push(`  - Text source: ${promptText(`${evidence.componentName}.${evidence.property}`)}${location} (${evidence.mountedCount} rendered instances).`);
  }
  return lines;
}

/** Shared presentation for captured facts; these do not change target matching. */
function targetEvidenceLines(evidence: {
  text?: string | null;
  props?: string | null;
  ariaLabel?: string | null;
  domPath?: string | null;
  elementId?: string | null;
}, example = false): string[] {
  const text = normalizeRuntimeText(evidence.text ?? null);
  const ariaLabel = boundRuntimeEvidence(evidence.ariaLabel ?? null);
  const elementId = boundRuntimeEvidence(evidence.elementId ?? null);
  const props = boundRuntimeEvidence(evidence.props ?? null);
  const lines: string[] = [];
  if (elementId && !example) lines.push(`- Element ID: ${promptText(elementId)}`);
  if (text) lines.push(`- ${example ? "Example text" : "Text"}: ${promptText(text)}`);
  if (ariaLabel) lines.push(`- ${example ? "Example accessible name" : "Accessible name"}: ${promptText(ariaLabel)}`);
  if (props && props !== `id:${elementId}`) lines.push(`- ${example ? "Example props" : "Props"}: ${promptText(props)}`);
  if (evidence.domPath && !example) lines.push(`- DOM path: ${promptText(evidence.domPath)}`);
  return lines;
}

function readableTargetLabel(text: string | null, tag?: string): string {
  if (tag) return elementLabel(tag);
  const bounded = normalizeRuntimeText(text);
  return bounded ? `Text: ${inlineHeadingText(bounded)}` : "Element";
}

/** Use an inline code span even when copy contains Markdown delimiters. */
function inlineHeadingText(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const delimiter = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function boundedEvidence(value: string | null): string | null {
  return boundRuntimeEvidence(value);
}

function sourceSiteLabel(ref: RenderedInstanceRef): string {
  if (!ref.sourceSite.src || isRuntimeGeneratedSource(ref.sourceSite.src)) {
    const text = boundedEvidence(ref.locator.text);
    const ariaLabel = boundedEvidence(ref.locator.ariaLabel ?? null);
    const props = boundedEvidence(ref.locator.props);
    if (ariaLabel) return `the element named ${promptText(ariaLabel)}`;
    if (text) return `the element with text ${promptText(text)}`;
    if (props) return `the element with props ${promptText(props)}`;
    return "the element";
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

function elementEvidenceLines(group: ElementGroup, example = false): string[] {
  const evidence = group.runtimeEvidence ?? group.sourceEvidence;
  return evidence ? targetEvidenceLines(evidence, example)
    : group.instanceOverride ? targetEvidenceLines(group.instanceOverride.target.locator, example) : [];
}

/** Combine identical final requests for individually selected elements. */
function selectedStyleGroupKey(group: ElementGroup): string {
  const requests = group.changes.map((change) => JSON.stringify([elementChangeLine(change), sourceIntentLine(change)])).sort();
  return JSON.stringify(["selected-styles", requests]);
}

function selectedItemLine(group: ElementGroup, sourceLocation: string | null): string {
  const facts = elementEvidenceLines(group).map((line) => line.slice(2));
  if (sourceLocation) facts.unshift(`Source: ${promptText(sourceLocation)}`);
  const invocation = group.instanceOverride?.target.locator.invocation;
  if (invocation) facts.push(`Component usage: ${promptText(invocation.callsiteId)}`);
  return `  - ${facts.join("; ") || "Selected element"}`;
}

function setHeading(label: string, tag: string | undefined): string {
  return tag ? `${label} (${promptText(`<${normalizeRuntimeTag(tag)}>`)})` : label;
}

/** Precision follows each element's identity origin, not the framework hint; hosts that declare nothing are exact everywhere. */
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

function formatSourceLocation(
  policy: SourceCoordinatePolicy | null,
  source: { cid?: string; file: string; line: number; column: number },
): string {
  if (hasExactAuthoredCoordinates(policy, source.cid, source.file) && source.column > 0) {
    return `${source.file}:${source.line}:${source.column}`;
  }
  return `${source.file}:${source.line}`;
}

function renderedInstanceDescription(ref: RenderedInstanceRef): string {
  const text = boundedEvidence(ref.locator.text);
  const ariaLabel = boundedEvidence(ref.locator.ariaLabel ?? null);
  const props = boundedEvidence(ref.locator.props);
  const source = ref.sourceSite.src && !isRuntimeGeneratedSource(ref.sourceSite.src)
    ? ` (${ref.sourceSite.src})`
    : "";

  if (text) return `text ${promptText(text)}${source}`;
  if (ariaLabel) return `the element named ${promptText(ariaLabel)}${source}`;
  if (props) return `the element with props ${promptText(props)}${source}`;

  // Without semantic evidence, the ordinal is the only way to distinguish repeated outputs from one source site.
  return `rendered instance ${ref.locator.occurrence + 1} of ${sourceSiteLabel(ref)}`;
}

function structuralChangeLine(change: StructuralChange): string {
  const target = renderedInstanceDescription(change.target);
  if (change.kind === "delete") {
    const invocation = change.target.locator.invocation;
    return invocation
      ? `- Remove the ${promptText(`<${invocation.componentName}>`)} invocation at ${invocation.callsiteId} from the source; keep its other invocations. It renders ${target}.`
      : `- Remove ${target} from the source.`;
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
    locator.invocation?.callsiteId ?? null,
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

    // Keep the first source context so the prompt describes the authored move, not the drag history.
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

/** Counts the exported intents, not the raw gesture history. */
export function countPromptChanges(changes: readonly ChangeRecord[], structuralChanges: readonly StructuralChange[] = [], sketchCount = 0): number {
  return canonicalizeChanges([...changes]).length + canonicalizeStructuralChanges(structuralChanges).length + sketchCount;
}

export function generatePrompt(
  changes: ChangeRecord[],
  frameworkHints?: FrameworkHints,
  structuralChanges: readonly StructuralChange[] = [],
  customInstructions: string = DEFAULT_CUSTOM_INSTRUCTIONS,
  sketches: readonly AgentSketchMetadata[] = [],
  comments: readonly ElementComment[] = getCommentsForTarget(documentTarget(window.location.href)),
): string {
  const deduplicated = canonicalizeChanges(changes);
  const structuralIntent = canonicalizeStructuralChanges(structuralChanges);
  if (deduplicated.length === 0 && structuralIntent.length === 0 && sketches.length === 0 && comments.length === 0) return EMPTY_SENTINEL;

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

  const groups = new Map<string, ElementPromptGroup>();
  function groupFor(key: string, heading: string, tag?: string): ElementPromptGroup {
    let group = groups.get(key);
    if (!group) {
      group = { heading, details: new Set(), lines: [] };
      groups.set(key, group);
    }
    if (tag) group.heading = elementLabel(tag);
    return group;
  }

  for (const change of componentChanges) {
    const target = change.target;
    const evidence = change.evidence;
    const scope = change.scope ?? "source-site";
    const key = JSON.stringify(["component", target.callsiteId, scope, scope === "rendered-instance"
      ? [evidence?.occurrence, evidence?.props, evidence?.ariaLabel] : null]);
    const group = groupFor(key, `${target.componentName} component`);
    group.lines.push(componentChangeLine(change));
    group.lines.push(editScopeLine(scope));
    group.details.add(`- Source: ${promptText(formatSourceLocation(coordinatePolicy, target))}`);
    if (evidence) {
      group.details.add(`- Rendered instances: ${evidence.mountedCount}`);
      if (evidence.props) group.details.add(`- Props: ${promptText(boundedEvidence(evidence.props) ?? "")}`);
      if (evidence.ariaLabel) group.details.add(`- Accessible name: ${promptText(boundedEvidence(evidence.ariaLabel) ?? "")}`);
      group.details.add(`- Before text: ${promptText(evidence.beforeText)}`);
    }
  }

  const selectedSets = new Map<string, ElementGroup[]>();
  for (const element of elementGroups) {
    if (!element.instanceOverride && element.changes[0]?.sourceInstanceCount !== 1) continue;
    const key = selectedStyleGroupKey(element);
    const selected = selectedSets.get(key) ?? [];
    selected.push(element);
    selectedSets.set(key, selected);
  }
  const exportedSets = new Set<string>();

  for (const element of elementGroups) {
    const first = element.changes[0]!;
    const runtimeCreated = !!element.runtimeEvidence || !element.file || isRuntimeGeneratedSource(element.file);
    const src = runtimeCreated ? "" : `${element.file}:${element.line}:${element.column}`;
    const key = element.instanceOverride ? refPromptKey(element.instanceOverride.target)
      : first.scope === "rendered-instance" && !runtimeCreated ? `style:${element.key}`
        : elementPromptKey(element.cid, src, "source-site");
    const tag = element.runtimeEvidence?.tagName ?? element.sourceEvidence?.tagName;
    const label = readableTargetLabel(element.runtimeEvidence?.text ?? element.sourceEvidence?.text ?? null, tag);
    const selectedKey = selectedStyleGroupKey(element);
    const selected = element.instanceOverride || first.sourceInstanceCount === 1 ? selectedSets.get(selectedKey) ?? [] : [];
    if (selected.length > 1) {
      if (exportedSets.has(selectedKey)) continue;
      exportedSets.add(selectedKey);
      const tags = new Set(selected.map((item) => item.runtimeEvidence?.tagName ?? item.sourceEvidence?.tagName));
      const group = groupFor(selectedKey, setHeading("Selected elements", tags.size === 1 ? tag : undefined));
      const locations = selected.map((item) => !item.runtimeEvidence && item.file && !isRuntimeGeneratedSource(item.file)
        ? formatSourceLocation(coordinatePolicy, item) : null);
      const sharedLocation = new Set(locations).size === 1 ? locations[0] : null;
      if (sharedLocation) group.details.add(`- Source: ${promptText(sharedLocation)}`);
      group.details.add(["- Selected items:", ...selected.map((item, index) =>
        selectedItemLine(item, sharedLocation ? null : locations[index] ?? null))].join("\n"));
      for (const change of element.changes) {
        group.lines.push(`${elementChangeLine(change)} for these selected items.`);
        const intent = sourceIntentLine(change);
        if (intent) group.lines.push(intent);
      }
      continue;
    }
    const linked = !element.instanceOverride && !runtimeCreated && first.scope !== "rendered-instance"
      && (element.changes.some((change) => (change.sourceInstanceCount ?? 1) > 1)
        || first.scope === "source-site" && first.sourceInstanceCount === undefined);
    const group = groupFor(key, label, tag);
    if (linked) group.heading = setHeading("Linked elements", tag);
    if (!runtimeCreated) {
      group.details.add(`- Source: \`${formatSourceLocation(coordinatePolicy, element)}\``);
    }
    for (const detail of elementEvidenceLines(element, linked)) group.details.add(detail);
    for (const change of element.changes) {
      const targetSet = linked ? " for all items rendered at this source location."
        : element.instanceOverride ? " for this selected item." : "";
      group.lines.push(`${elementChangeLine(change)}${targetSet}`);
      const intent = sourceIntentLine(change);
      if (intent) group.lines.push(intent);
    }
  }

  for (const change of textChanges) {
    const target = change.target;
    const runtimeCreated = !target.sourceSite.src || isRuntimeGeneratedSource(target.sourceSite.src);
    const scope = change.scope ?? "rendered-instance";
    const key = elementPromptKey(target.sourceSite.cid, target.sourceSite.src, scope, {
      kind: "evidence", occurrence: target.occurrence, props: target.props, text: target.beforeText, ariaLabel: target.ariaLabel,
    });
    const group = groupFor(key, readableTargetLabel(change.before, target.tagName), target.tagName);
    const sourceLocation = runtimeCreated ? null : formatSourceLocation(coordinatePolicy, {
      cid: target.sourceSite.cid, ...change.source,
    });
    if (sourceLocation) group.details.add(`- Source: ${promptText(sourceLocation)}`);
    group.lines.push(`- **Change:** Replace text ${promptText(change.before)} with ${promptText(change.after)}.`);
    if (change.scope) group.lines.push(editScopeLine(change.scope));
    if (change.authoredAs === "expression") group.lines.push("  - Preserve the expression and update its source logic.");
    group.lines.push(...textBindingLines(change, sourceLocation));
    for (const detail of targetEvidenceLines({
      ...target, text: group.heading.startsWith("Text:") ? null : target.beforeText,
    })) group.details.add(detail);
  }

  for (const change of structuralIntent) {
    const ref = change.target;
    const group = groupFor(refPromptKey(ref), readableTargetLabel(ref.locator.text));
    group.lines.push(structuralChangeLine(change));
  }

  for (const comment of comments) {
    const ref = comment.target;
    const runtimeCreated = !ref.sourceSite.src || isRuntimeGeneratedSource(ref.sourceSite.src);
    const group = groupFor(refPromptKey(ref), elementLabel(comment.tag), comment.tag);
    if (!runtimeCreated) {
      const parsed = /^(.*):(\d+):(\d+)$/.exec(ref.sourceSite.src);
      const location = parsed ? formatSourceLocation(coordinatePolicy, {
        cid: ref.sourceSite.cid, file: parsed[1]!, line: Number(parsed[2]), column: Number(parsed[3]),
      }) : ref.sourceSite.src;
      group.details.add(`- Source: ${promptText(location)}`);
    }
    group.details.add(`- Page: ${promptText(comment.route)}`);
    for (const detail of targetEvidenceLines(ref.locator)) group.details.add(detail);
    group.lines.push(`- **Note:** ${promptText(comment.note)}`);
  }

  for (const group of groups.values()) {
    sections.push({ heading: group.heading, lines: group.details.size > 0 ? [...group.details, "", ...group.lines] : group.lines });
  }

  return renderPrompt(sections, customInstructions);
}
