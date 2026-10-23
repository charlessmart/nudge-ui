import { isComponentChange, isElementChange, isTextContentChange, isTokenChange } from "../changes/types.ts";
import type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  TokenChangeRecord,
  TextContentChangeRecord,
} from "../changes/types.ts";
import type { InvocationRef, RenderedInstanceOverride, RenderedInstanceRef } from "../changes/editModel.ts";
import type { StructuralChange } from "../projection/structuralProjection.ts";
import { canonicalizeChanges, tokenReference } from "../changes/model.ts";
import {
  boundRuntimeEvidence,
  isRuntimeGeneratedSource,
  normalizeRuntimeTag,
  normalizeRuntimeText,
} from "../runtime/staticHtmlRuntimeIdentity.ts";
import { getSourceCoordinatePolicy, type SourceCoordinatePolicy } from "../runtime/runtimeConfig.ts";
import type { AgentSketchMetadata } from "../agent/protocol.ts";
import { DEFAULT_CUSTOM_INSTRUCTIONS } from "./promptSettings.ts";
import { PROMPT_INTRO } from "./promptDocument.ts";

import { getCommentsForTarget, type ElementComment } from "../comments/store.ts";
import { documentTarget } from "../drafts/model.ts";
import { isPageTargetCid } from "../selection/pageTarget.ts";

export interface FrameworkHints {
  framework?: string;
  stylingSystem?: string;
}

const EMPTY_SENTINEL = "There are no changes to export yet. Make a change in the Nudge UI inspector first.";

/** The ways a prompt can point at an element, best first: a location or id finds the code directly, copy and labels are searchable, props and DOM paths are the weakest guides. */
const INDICATOR_RANK = ["source", "elementId", "text", "ariaLabel", "props", "domPath"] as const;
type Indicator = (typeof INDICATOR_RANK)[number];

interface TargetFacts {
  source?: string;
  elementId?: string;
  text?: string;
  ariaLabel?: string;
  props?: string;
  domPath?: string;
}

/** More than two pointers makes the prompt read like a dump; two are enough to find the right element. */
const MAX_INDICATORS = 2;

const INDICATOR_PHRASES = {
  source: (value: string) => `in ${value}`,
  elementId: (value: string) => `with the id ${quoted(value)}`,
  text: (value: string) => `that says ${quoted(value)}`,
  ariaLabel: (value: string) => `labeled ${quoted(value)}`,
  props: (value: string) => `with the props ${value}`,
  domPath: (value: string) => `located at ${value}`,
} satisfies Record<Indicator, (value: string) => string>;

/** `one` edits a single rendered item; `all` edits every item rendered from the same source location. */
type GroupScope = "default" | "one" | "all";

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

/** Everything the prompt says about one target; the heading is written last, once all facts are merged. */
interface PromptGroup {
  noun: string;
  scope: GroupScope;
  facts: TargetFacts;
  heading?: string;
  rendered?: number;
  ordinal?: number;
  intro: string[];
  lines: string[];
}

interface EvidenceFields {
  text?: string | null;
  props?: string | null;
  ariaLabel?: string | null;
  domPath?: string | null;
  elementId?: string | null;
}

const ELEMENT_NOUNS = new Map<string, string>([
  ["p", "paragraph"], ["button", "button"], ["a", "link"], ["img", "image"], ["input", "input"],
  ["textarea", "text area"], ["select", "dropdown"], ["form", "form"], ["nav", "navigation"], ["section", "section"],
]);

/** Nouns describe the observed tag, without guessing its role in the page. */
function nounFor(tag: string | undefined): string {
  const normalized = tag ? normalizeRuntimeTag(tag) : "";
  if (!normalized) return "element";
  if (/^h[1-6]$/.test(normalized)) return `${normalized} heading`;
  return ELEMENT_NOUNS.get(normalized) ?? `${normalized} element`;
}

/** Rendered copy is quoted and escaped so it stays on one line and cannot pass for prompt structure. */
function quoted(value: string): string {
  return JSON.stringify(value);
}

function singleLine(value: string | null | undefined): string | undefined {
  const line = value?.replace(/\s+/g, " ").trim();
  return line || undefined;
}

function evidenceFacts(evidence: EvidenceFields, source: string | null = null): TargetFacts {
  const facts: TargetFacts = {};
  const elementId = singleLine(boundRuntimeEvidence(evidence.elementId ?? null));
  const text = normalizeRuntimeText(evidence.text ?? null);
  const ariaLabel = singleLine(boundRuntimeEvidence(evidence.ariaLabel ?? null));
  const props = singleLine(boundRuntimeEvidence(evidence.props ?? null));
  const domPath = singleLine(evidence.domPath);
  if (source) facts.source = source;
  if (elementId) facts.elementId = elementId;
  if (text) facts.text = text;
  if (ariaLabel) facts.ariaLabel = ariaLabel;
  if (props && props !== `id:${elementId}`) facts.props = props;
  if (domPath) facts.domPath = domPath;
  return facts;
}

/** The first group to mention a fact keeps it, so later contributors cannot reword the target. */
function addFacts(into: TargetFacts, from: TargetFacts): void {
  for (const kind of INDICATOR_RANK) {
    const value = from[kind];
    if (value !== undefined && into[kind] === undefined) into[kind] = value;
  }
}

function topIndicators(facts: TargetFacts, omit: readonly Indicator[] = [], limit = MAX_INDICATORS): Indicator[] {
  return INDICATOR_RANK.filter((kind) => facts[kind] !== undefined && !omit.includes(kind)).slice(0, limit);
}

/** Indicators that only locate the code cannot tell identical outputs apart, so a bare source location falls back to the render position. */
function targetDetails(facts: TargetFacts, ordinal?: number): string[] {
  const kinds = topIndicators(facts);
  const details = kinds.map((kind) => INDICATOR_PHRASES[kind](facts[kind]!));
  if (ordinal !== undefined && kinds.every((kind) => kind === "source")) details.push(`(rendered instance ${ordinal + 1})`);
  return details;
}

function groupHeading(group: PromptGroup): string {
  if (group.heading) return group.heading;
  const { facts, noun } = group;
  if (group.scope === "all") {
    const [example] = topIndicators(facts, ["source", "elementId", "domPath"], 1);
    const notes = [
      example ? `for example, the one ${INDICATOR_PHRASES[example](facts[example]!)}` : null,
      group.rendered !== undefined ? `currently ${group.rendered} on the page` : null,
    ].filter((note) => note !== null);
    return `Every ${noun}${facts.source ? ` rendered from ${facts.source}` : ""}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}:`;
  }
  const details = targetDetails(facts, group.ordinal);
  if (group.scope === "one") {
    return `Just this ${noun}${details.length > 0 ? `, the one ${details.join(" ")}` : ""}:`;
  }
  return `The ${[noun, ...details].join(" ")}:`;
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

/** Plain paragraphs, not a document: the prompt is read in a text box and spoken in the user's voice. */
function renderPrompt(blocks: string[], customInstructions: string): string {
  const instructions = customInstructions.trim();
  return [PROMPT_INTRO, ...blocks, ...(instructions ? [instructions] : [])].join("\n\n");
}

function renderGroup(group: PromptGroup): string {
  return [groupHeading(group), ...group.intro, ...group.lines].join("\n");
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

const STATE_LEADS = {
  base: "",
  hover: "On hover, ",
  active: "While pressed (:active), ",
  focus: "On focus, ",
  "focus-visible": "On keyboard focus (:focus-visible), ",
  disabled: "When disabled, ",
} satisfies Record<NonNullable<ElementChangeRecord["state"]>, string>;

function elementChangeLine(rec: ElementChangeRecord): string {
  const lead = STATE_LEADS[rec.state ?? "base"];
  let change: string;
  if (rec.newToken && rec.oldToken) {
    change = `change ${rec.property} from the ${rec.oldToken.name} token to the ${rec.newToken.name} token`;
  } else if (rec.newToken || rec.rawValue !== undefined) {
    // Adapter token names are not always custom-property names, so emit the literal the stylesheet wrote.
    const after = rec.newToken ? tokenReference(rec.newToken) : rec.rawValue;
    change = rec.oldRawValue !== undefined
      ? `change ${rec.property} from ${rec.oldRawValue} to ${after}`
      : `set ${rec.property} to ${after}`;
  } else {
    change = `update ${rec.property} (no value was recorded)`;
  }
  const sentence = `${lead}${change}.`;
  return `- ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}

function sourceIntentLine(rec: ElementChangeRecord): string | null {
  if (!rec.sourceProperty || rec.sourceProperty === rec.property) return null;
  const authored = rec.sourceAuthoredValue ? `: ${rec.sourceAuthoredValue}` : "";
  return `  In the code this is written as ${rec.sourceProperty}${authored}. I previewed it using ${rec.property}.`;
}

function tokenChangeLine(rec: TokenChangeRecord): string {
  const where = [rec.contextLabel, `${rec.file}:${rec.line}`].filter(Boolean).join(", ");
  return `- Change ${rec.tokenName} from ${rec.oldRawValue} to ${rec.rawValue} (in ${where}).`;
}

function propValue(value: ComponentChangeRecord["after"]): string {
  return typeof value === "string" ? quoted(value) : String(value);
}

function componentGuidance(rec: ComponentChangeRecord): string {
  switch (rec.authoredAs) {
    case "literal":
      return rec.property === "children" ? "it's plain text in the code, so just replace it" : "";
    case "default":
      return "it isn't set where this is used yet, so add it there";
    case "spread":
      return "it comes from a spread in the code, so keep that and update where it comes from";
    default:
      return "it's an expression in the code, so keep it and update its logic";
  }
}

function componentChangeLine(rec: ComponentChangeRecord): string {
  const from = rec.before.kind === "default" ? "its default" : propValue(rec.before.value);
  const guidance = componentGuidance(rec);
  return `- Change the ${rec.property} prop from ${from} to ${propValue(rec.after)}${guidance ? ` (${guidance})` : ""}.`;
}

function scopeFor(scope: "source-site" | "rendered-instance"): GroupScope {
  return scope === "rendered-instance" ? "one" : "all";
}

function textBindingLines(change: TextContentChangeRecord, sourceLocation: string | null): string[] {
  const evidence = change.evidence;
  if (!evidence) return [];
  const location = evidence.callsiteId === sourceLocation ? "" : `, set at ${evidence.callsiteId}`;
  const count = evidence.mountedCount > 1 ? `; ${evidence.componentName} is rendered ${evidence.mountedCount} times` : "";
  return [`  This text comes from the ${evidence.property} prop of ${evidence.componentName}${location}${count}.`];
}

function elementEvidence(group: ElementGroup): EvidenceFields {
  return group.runtimeEvidence ?? group.sourceEvidence ?? group.instanceOverride?.target.locator ?? {};
}

/** Combine identical final requests for individually selected elements. */
function selectedStyleGroupKey(group: ElementGroup): string {
  const requests = group.changes.map((change) => JSON.stringify([elementChangeLine(change), sourceIntentLine(change)])).sort();
  return JSON.stringify(["selected-styles", requests]);
}

function selectedItemLine(group: ElementGroup, sourceLocation: string | null, sharedSource: boolean): string {
  const facts = evidenceFacts(elementEvidence(group), sourceLocation);
  const kinds = topIndicators(facts, [], sharedSource ? 1 : MAX_INDICATORS);
  const details = kinds.length > 0
    ? `the one ${kinds.map((kind) => INDICATOR_PHRASES[kind](facts[kind]!)).join(" ")}`
    : "one with no distinguishing details";
  const invocation = group.instanceOverride?.target.locator.invocation;
  return `  - ${details}${invocation ? ` (component used at ${invocation.callsiteId})` : ""}`;
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

function isAuthoredSource(src: string): boolean {
  return src !== "" && !isRuntimeGeneratedSource(src);
}

function refFacts(ref: RenderedInstanceRef): TargetFacts {
  return evidenceFacts(ref.locator, isAuthoredSource(ref.sourceSite.src) ? ref.sourceSite.src : null);
}

function refDescription(ref: RenderedInstanceRef): string {
  return `the ${[nounFor(ref.locator.tagName), ...targetDetails(refFacts(ref), ref.locator.occurrence)].join(" ")}`;
}

/**
 * Names a parent by its component when the source is known, since its rendered copy is rarely a useful pointer.
 * A parent that renders an invocation's children is edited at that callsite, not where its own JSX is defined.
 */
function containerDescription(ref: RenderedInstanceRef, childrenOf?: InvocationRef): string {
  if (childrenOf) return `the children of the <${childrenOf.componentName}> at ${childrenOf.callsiteId}`;
  return isAuthoredSource(ref.sourceSite.src) ? `${ref.sourceSite.cid} (${ref.sourceSite.src})` : refDescription(ref);
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

/** The group heading already names the moved or removed element, so each line refers to it as "it". */
function structuralChangeLine(change: StructuralChange): string {
  if (change.kind === "delete") {
    const invocation = change.target.locator.invocation;
    return invocation
      ? `- Remove it from the source by deleting the <${invocation.componentName}> at ${invocation.callsiteId}, but keep the other <${invocation.componentName}> usages.`
      : "- Remove it from the source.";
  }
  const before = change.destination.before;
  const destinationParent = containerDescription(change.destination.parent, change.destination.childrenOf);
  if (structuralParentIdentityKey(change.source.parent) !== structuralParentIdentityKey(change.destination.parent)) {
    const sourceParent = containerDescription(change.source.parent, change.source.childrenOf);
    return before
      ? `- Move it from ${sourceParent} into ${destinationParent}, before ${refDescription(before)}.`
      : `- Move it from ${sourceParent} into ${destinationParent}, at the end.`;
  }
  return before
    ? `- Move it before ${refDescription(before)}, inside ${destinationParent}.`
    : `- Move it to the end of ${destinationParent}.`;
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
  const blocks: string[] = [];

  if (tokenChanges.length > 0) {
    blocks.push(["Site-wide design tokens:", ...tokenChanges.map(tokenChangeLine)].join("\n"));
  }

  const groups = new Map<string, PromptGroup>();
  function groupFor(key: string, tag?: string): PromptGroup {
    let group = groups.get(key);
    if (!group) {
      group = { noun: "element", scope: "default", facts: {}, intro: [], lines: [] };
      groups.set(key, group);
    }
    if (tag) group.noun = nounFor(tag);
    return group;
  }
  /** A group that already has a scope keeps it; later contributors only fill in the default. */
  function scopeGroup(group: PromptGroup, scope: GroupScope): void {
    if (group.scope === "default") group.scope = scope;
  }

  for (const change of componentChanges) {
    const target = change.target;
    const evidence = change.evidence;
    const scope = change.scope ?? "source-site";
    const key = JSON.stringify(["component", target.callsiteId, scope, scope === "rendered-instance"
      ? [evidence?.occurrence, evidence?.props, evidence?.ariaLabel] : null]);
    const group = groupFor(key);
    group.noun = `${target.componentName} component`;
    scopeGroup(group, scopeFor(scope));
    addFacts(group.facts, { source: formatSourceLocation(coordinatePolicy, target) });
    if (evidence) {
      group.rendered = evidence.mountedCount;
      addFacts(group.facts, evidenceFacts({ props: evidence.props, ariaLabel: evidence.ariaLabel, text: evidence.beforeText }));
    }
    group.lines.push(componentChangeLine(change));
  }

  const selectedSets = new Map<string, ElementGroup[]>();
  for (const element of elementGroups) {
    if (isPageTargetCid(element.cid)) continue;
    if (!element.instanceOverride && element.changes[0]?.sourceInstanceCount !== 1) continue;
    const key = selectedStyleGroupKey(element);
    const selected = selectedSets.get(key) ?? [];
    selected.push(element);
    selectedSets.set(key, selected);
  }
  const exportedSets = new Set<string>();

  for (const element of elementGroups) {
    if (isPageTargetCid(element.cid)) {
      const group = groupFor(element.key, "body");
      group.heading = "The whole page (its body element):";
      group.intro = ["These are page-wide styles that everything inherits, so please change the global stylesheet or root layout that styles the body, not a single component."];
      for (const change of element.changes) {
        group.lines.push(elementChangeLine(change));
        const intent = sourceIntentLine(change);
        if (intent) group.lines.push(intent);
      }
      continue;
    }
    const first = element.changes[0]!;
    const runtimeCreated = !!element.runtimeEvidence || !element.file || isRuntimeGeneratedSource(element.file);
    const src = runtimeCreated ? "" : `${element.file}:${element.line}:${element.column}`;
    const key = element.instanceOverride ? refPromptKey(element.instanceOverride.target)
      : first.scope === "rendered-instance" && !runtimeCreated ? `style:${element.key}`
        : elementPromptKey(element.cid, src, "source-site");
    const tag = element.runtimeEvidence?.tagName ?? element.sourceEvidence?.tagName;
    const selectedKey = selectedStyleGroupKey(element);
    const selected = element.instanceOverride || first.sourceInstanceCount === 1 ? selectedSets.get(selectedKey) ?? [] : [];
    if (selected.length > 1) {
      if (exportedSets.has(selectedKey)) continue;
      exportedSets.add(selectedKey);
      const tags = new Set(selected.map((item) => item.runtimeEvidence?.tagName ?? item.sourceEvidence?.tagName));
      const group = groupFor(selectedKey);
      const locations = selected.map((item) => !item.runtimeEvidence && item.file && !isRuntimeGeneratedSource(item.file)
        ? formatSourceLocation(coordinatePolicy, item) : null);
      const sharedLocation = new Set(locations).size === 1 ? locations[0] ?? null : null;
      group.heading = `These ${selected.length} ${tags.size === 1 ? nounFor(tag) : "element"}s${sharedLocation ? `, ${selected.length === 2 ? "both" : "all"} in ${sharedLocation}` : ""}:`;
      group.intro = [
        ...selected.map((item, index) => selectedItemLine(item, sharedLocation ? null : locations[index] ?? null, sharedLocation !== null)),
        "Make these changes to each of them:",
      ];
      for (const change of element.changes) {
        group.lines.push(elementChangeLine(change));
        const intent = sourceIntentLine(change);
        if (intent) group.lines.push(intent);
      }
      continue;
    }
    const linked = !element.instanceOverride && !runtimeCreated && first.scope !== "rendered-instance"
      && (element.changes.some((change) => (change.sourceInstanceCount ?? 1) > 1)
        || first.scope === "source-site" && first.sourceInstanceCount === undefined);
    const group = groupFor(key, tag);
    if (linked) scopeGroup(group, "all");
    else if (element.instanceOverride) scopeGroup(group, "one");
    if (!runtimeCreated) addFacts(group.facts, { source: formatSourceLocation(coordinatePolicy, element) });
    addFacts(group.facts, evidenceFacts(elementEvidence(element)));
    for (const change of element.changes) {
      group.lines.push(elementChangeLine(change));
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
    const group = groupFor(key, target.tagName);
    const sourceLocation = runtimeCreated ? null : formatSourceLocation(coordinatePolicy, {
      cid: target.sourceSite.cid, ...change.source,
    });
    if (change.scope) scopeGroup(group, scopeFor(change.scope));
    addFacts(group.facts, evidenceFacts({ ...target, text: target.beforeText }, sourceLocation));
    group.lines.push(`- Change the text from ${quoted(change.before)} to ${quoted(change.after)}.`);
    if (change.authoredAs === "expression") group.lines.push("  It's an expression in the code, so keep it and update its logic.");
    group.lines.push(...textBindingLines(change, sourceLocation));
  }

  for (const change of structuralIntent) {
    const ref = change.target;
    const group = groupFor(refPromptKey(ref), ref.locator.tagName);
    addFacts(group.facts, refFacts(ref));
    group.ordinal ??= ref.locator.occurrence;
    group.lines.push(structuralChangeLine(change));
  }

  for (const comment of comments) {
    const ref = comment.target;
    const group = groupFor(refPromptKey(ref), comment.tag);
    let source: string | null = null;
    if (isAuthoredSource(ref.sourceSite.src)) {
      const parsed = /^(.*):(\d+):(\d+)$/.exec(ref.sourceSite.src);
      source = parsed ? formatSourceLocation(coordinatePolicy, {
        cid: ref.sourceSite.cid, file: parsed[1]!, line: Number(parsed[2]), column: Number(parsed[3]),
      }) : ref.sourceSite.src;
    }
    addFacts(group.facts, evidenceFacts(ref.locator, source));
    group.lines.push(`- My note on it (page: ${comment.route}): ${quoted(comment.note)}`);
  }

  for (const group of groups.values()) blocks.push(renderGroup(group));

  return renderPrompt(blocks, customInstructions);
}
