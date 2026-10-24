import { collectRules } from "../tokens/resolution/cssomCollector.ts";
import { selectorPseudoClasses, splitSelectorAtTopLevel } from "../tokens/resolution/selectorSemantics.ts";
import type { InteractionState } from "../shell/styleState.ts";

export type PreviewState = Exclude<InteractionState, "base" | "disabled">;

/** One part of a selector that has to change for its motion rule to apply. */
export type MotionCondition =
  | { readonly kind: "pseudo"; readonly state: PreviewState }
  | { readonly kind: "attribute"; readonly name: string; readonly value: string }
  | { readonly kind: "class"; readonly name: string };

export type AnimationTimelineKind = "document" | "scroll";

/** One animation: the trigger plus every element that moves; states with identical movement collapse. */
export interface AnimationGroup {
  readonly id: string;
  readonly kind: "keyframes" | "state";
  readonly label: string;
  /** The topmost element involved: the one carrying the state, or the element with the keyframes. */
  readonly trigger: HTMLElement;
  /** Elements that animate, each with the properties (or keyframes name) that change. */
  readonly members: ReadonlyMap<HTMLElement, ReadonlySet<string>>;
  /** What to force when running it; null for a keyframes group, which has no state. */
  readonly state: PreviewState | null;
  /** Every condition a state group has to satisfy, so attribute, class and hover triggers replay alike. */
  readonly conditions: readonly MotionCondition[];
  /** Whether the animation follows the document clock or a scroll/view timeline. */
  readonly timeline: AnimationTimelineKind;
  readonly name: string;
}

export type AnimationEntry =
  | { readonly id: string; readonly kind: "keyframes"; readonly label: string; readonly name: string; readonly group: AnimationGroup }
  | { readonly id: string; readonly kind: "state"; readonly label: string; readonly state: PreviewState | null; readonly group: AnimationGroup }
  | { readonly id: string; readonly kind: "running"; readonly label: string }
  | { readonly id: string; readonly kind: "click"; readonly label: string };

export const CLICK_ENTRY: AnimationEntry = { id: "click", kind: "click", label: "Click" };

const PAGE_ELEMENT_LIMIT = 5000;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "NOSCRIPT", "TEMPLATE"]);

/** Data attributes the inspector or a test framework owns rather than the application's motion state. */
const IDENTITY_DATA_ATTRIBUTES = new Set([
  "data-cid", "data-src", "data-cprops", "data-renderer-id", "data-vite-dev-id",
  "data-empty-text", "data-empty-text-path", "data-inline-editor",
]);
const INTERNAL_DATA_PREFIXES = ["data-test", "data-nudge", "data-projection", "data-container-probe-"];
const STATE_ATTRIBUTES = new Set([
  "aria-expanded", "aria-pressed", "aria-selected", "aria-hidden", "aria-current",
  "open", "hidden", "checked", "selected",
]);
const STATE_CLASSES = new Set([
  "active", "open", "opened", "closed", "visible", "hidden", "shown", "entered", "exited",
  "expanded", "collapsed", "selected", "loading", "ready", "mounted", "animating", "animated",
  "in", "out", "on", "off",
]);
const ANIMATION_KEYWORDS = new Set([
  "none", "normal", "reverse", "alternate", "alternate-reverse", "forwards", "backwards", "both",
  "infinite", "running", "paused", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
  "initial", "inherit", "unset", "revert", "revert-layer",
]);

function isPreviewState(name: string): name is PreviewState {
  return name === "hover" || name === "focus-visible" || name === "focus" || name === "active";
}

const STATE_LABEL = { hover: "Hover", "focus-visible": "Focus", focus: "Focus", active: "Active" } satisfies Record<PreviewState, string>;

/** The state a person is likeliest to try first, used to name a movement several states restate. */
const STATE_PRECEDENCE = { hover: 0, "focus-visible": 1, focus: 2, active: 3 } satisfies Record<PreviewState, number>;

/** Declarations that mean an element may transition or run keyframes. */
const MOTION_PROPERTIES = new Set([
  "transition", "transition-property", "transition-duration", "transition-delay",
  "animation", "animation-name", "animation-duration", "animation-delay",
]);

function list(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

/** Properties the element transitions, pairing each name with its own duration (durations repeat when fewer). */
function transitionedProperties(style: CSSStyleDeclaration): Set<string> {
  const properties = list(style.transitionProperty);
  const durations = list(style.transitionDuration);
  const delays = list(style.transitionDelay);
  const result = new Set<string>();
  properties.forEach((property, index) => {
    const duration = parseFloat(durations[index % Math.max(1, durations.length)] ?? "0");
    const delay = parseFloat(delays[index % Math.max(1, delays.length)] ?? "0");
    if (property !== "none" && (duration > 0 || delay > 0)) result.add(property);
  });
  return result;
}

function summary(names: readonly string[]): string {
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? "";
}

function humanize(value: string): string {
  const words = value.replace(/^data-|^aria-/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : value;
}

function conditionLabel(conditions: readonly MotionCondition[]): string {
  const labels = conditions.map((condition) => {
    if (condition.kind === "pseudo") return STATE_LABEL[condition.state];
    if (condition.kind === "class") return humanize(condition.name.replace(/^(?:is|has|with|state|js)-/, ""));
    const value = condition.value;
    if (value && value !== "true" && value !== "false") return humanize(value);
    return humanize(condition.name);
  });
  return labels.join(" + ");
}

function conditionKey(condition: MotionCondition): string {
  if (condition.kind === "attribute") return `attribute:${condition.name}=${condition.value}`;
  if (condition.kind === "class") return `class:${condition.name}`;
  return `pseudo:${condition.state}`;
}

function conditionsKey(conditions: readonly MotionCondition[]): string {
  return conditions.map(conditionKey).join("&");
}

function isStateAttribute(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "class" || lower === "style" || lower === "id") return false;
  if (lower.startsWith("data-")) {
    return !IDENTITY_DATA_ATTRIBUTES.has(lower)
      && !INTERNAL_DATA_PREFIXES.some((prefix) => lower.startsWith(prefix));
  }
  return STATE_ATTRIBUTES.has(lower);
}

function isStateClass(name: string): boolean {
  const lower = name.toLowerCase();
  return STATE_CLASSES.has(lower) || /^(?:is|has|with|state|js)-/.test(lower);
}

interface ConditionRange {
  readonly condition: MotionCondition;
  readonly start: number;
  readonly end: number;
}

function attributeCondition(text: string): MotionCondition | null {
  const match = /^\[\s*([^\]\s~|^$*=]+)\s*(?:(~=|\|=|\^=|\$=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*[iIsS]?\s*)?\]$/.exec(text);
  if (!match) return null;
  const name = match[1]!;
  if (!isStateAttribute(name)) return null;
  return { kind: "attribute", name, value: match[3] ?? match[4] ?? match[5] ?? "" };
}

function attributeEnd(selector: string, start: number): number {
  let quote: string | null = null;
  let escaped = false;
  for (let index = start + 1; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "]") return index + 1;
  }
  return selector.length;
}

function classEnd(selector: string, start: number): number {
  let index = start + 1;
  while (index < selector.length) {
    const character = selector[index]!;
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (!/[A-Za-z0-9_-]/.test(character) && character.charCodeAt(0) < 0x80) break;
    index++;
  }
  return index;
}

/** Removes `::before` and the legacy single-colon spellings, which cannot be passed to `querySelectorAll`. */
function withoutPseudoElements(selector: string): string {
  return selector
    .replace(/::[A-Za-z-]+(?:\([^)]*\))?/g, "")
    .replace(/:(?:before|after|first-line|first-letter)\b/g, "");
}

function compoundBounds(selector: string, start: number, end: number) {
  let compoundStart = start;
  let depth = 0;
  while (compoundStart > 0) {
    const character = selector[compoundStart - 1]!;
    if (character === ")" || character === "]") depth++;
    else if (character === "(" || character === "[") depth--;
    else if (depth === 0 && /[\s>+~]/.test(character)) break;
    compoundStart--;
  }
  let compoundEnd = end;
  depth = 0;
  while (compoundEnd < selector.length) {
    const character = selector[compoundEnd]!;
    if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(character)) break;
    compoundEnd++;
  }
  return { start: compoundStart, end: compoundEnd };
}

function removeRanges(text: string, offset: number, ranges: readonly Pick<ConditionRange, "start" | "end">[]): string {
  let result = text;
  // Pseudo conditions are collected before attribute and class ones, so sort rather than trusting input order.
  for (const range of [...ranges].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, range.start - offset) + result.slice(range.end - offset);
  }
  return result;
}

function normalizedSelector(selector: string): string {
  const trimmed = selector.trim().replace(/\s+/g, " ");
  if (!trimmed) return "*";
  return /[>+~]$/.test(trimmed) ? `${trimmed} *` : trimmed;
}

/** Resolves a trigger compound that matches a sibling of the candidate rather than one of its ancestors. */
function siblingTrigger(candidate: Element, compound: string): Element | null {
  let current: Element | null = candidate;
  while (current && current !== current.ownerDocument.body) {
    for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      try {
        if (sibling.matches(compound)) return sibling;
      } catch {
        return null;
      }
    }
    current = current.parentElement;
  }
  return null;
}

function asAnimationElement(element: Element): HTMLElement {
  // SAFETY: SVG elements share the attributes, containment and animation APIs this scan reads.
  return element as HTMLElement;
}

function triggerFor(candidate: Element, compound: StatefulCompound): HTMLElement {
  try {
    if (!compound.subject && compound.compound === "*") {
      // A bare `.is-open` or `[data-state]` often sits on an ancestor; the nearest parent still matches a descendant rule.
      const sibling = compound.combinator === "~" || compound.combinator === "+"
        ? candidate.previousElementSibling
        : null;
      return asAnimationElement(sibling ?? candidate.parentElement ?? candidate);
    }
    return asAnimationElement(candidate.closest(compound.compound) ?? siblingTrigger(candidate, compound.compound) ?? candidate);
  } catch {
    return asAnimationElement(candidate);
  }
}

interface StatefulCompound {
  readonly conditions: readonly MotionCondition[];
  /** The compound that carries the conditions, with them removed: `.card` for `.card:hover .child`. */
  readonly compound: string;
  /** Whether the compound is the selector's subject, which applies to the candidate itself. */
  readonly subject: boolean;
  /** The combinator before the compound, so a bare condition switch can pick the right neighbour. */
  readonly combinator: " " | ">" | "+" | "~";
}

interface ParsedConditions {
  /** The selector with every motion condition and pseudo-element removed. */
  readonly stripped: string;
  readonly compounds: readonly StatefulCompound[];
}

/** Finds interaction states and the attribute/class switches applications use in their place. */
function parseConditions(branch: string): ParsedConditions | null {
  const ranges: ConditionRange[] = [];
  for (const pseudo of selectorPseudoClasses(branch)) {
    if (isPreviewState(pseudo.name)) {
      ranges.push({ condition: { kind: "pseudo", state: pseudo.name }, start: pseudo.start, end: pseudo.end });
    }
  }

  let parentheses = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < branch.length; index++) {
    const character = branch[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      const end = attributeEnd(branch, index);
      if (parentheses === 0) {
        const condition = attributeCondition(branch.slice(index, end));
        if (condition) ranges.push({ condition, start: index, end });
      }
      index = end - 1;
      continue;
    }
    if (character === "(") {
      parentheses++;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (character !== "." || parentheses > 0) continue;
    const end = classEnd(branch, index);
    const name = branch.slice(index + 1, end);
    if (isStateClass(name)) ranges.push({ condition: { kind: "class", name }, start: index, end });
    index = end - 1;
  }

  if (ranges.length === 0) return null;
  const byCompound = new Map<string, { start: number; end: number; conditions: MotionCondition[] }>();
  for (const range of ranges) {
    const bounds = compoundBounds(branch, range.start, range.end);
    const key = `${bounds.start}:${bounds.end}`;
    let compound = byCompound.get(key);
    if (!compound) {
      compound = { ...bounds, conditions: [] };
      byCompound.set(key, compound);
    }
    if (!compound.conditions.some((condition) => conditionKey(condition) === conditionKey(range.condition))) {
      compound.conditions.push(range.condition);
    }
  }

  const compounds = [...byCompound.values()].map(({ start, end, conditions }) => {
    const inside = ranges.filter((range) => range.start >= start && range.end <= end);
    const compound = withoutPseudoElements(removeRanges(branch.slice(start, end), start, inside)).trim() || "*";
    const remainder = withoutPseudoElements(branch.slice(end)).trim();
    let previous = start - 1;
    while (previous >= 0 && /\s/.test(branch[previous]!)) previous--;
    let combinator: " " | ">" | "+" | "~" = " ";
    if (branch[previous] === ">") combinator = ">";
    else if (branch[previous] === "+") combinator = "+";
    else if (branch[previous] === "~") combinator = "~";
    return { conditions, compound, subject: remainder === "", combinator };
  });
  return {
    stripped: normalizedSelector(withoutPseudoElements(removeRanges(branch, 0, ranges))),
    compounds,
  };
}

let nextTriggerId = 1;
const triggerIds = new WeakMap<HTMLElement, number>();

function triggerId(element: HTMLElement): number {
  let id = triggerIds.get(element);
  if (id === undefined) {
    id = nextTriggerId++;
    triggerIds.set(element, id);
  }
  return id;
}

interface MutableGroup {
  readonly kind: "keyframes" | "state";
  readonly trigger: HTMLElement;
  readonly members: Map<HTMLElement, Set<string>>;
  readonly state: PreviewState | null;
  readonly conditions: readonly MotionCondition[];
  timeline: AnimationTimelineKind;
  readonly key: string;
  readonly name: string;
}

function buildGroup(group: MutableGroup): AnimationGroup {
  const properties = new Set<string>();
  for (const names of group.members.values()) for (const name of names) properties.add(name);
  const label = group.kind === "keyframes"
    ? group.timeline === "scroll" ? `Scroll · ${group.name}` : group.name
    : `${conditionLabel(group.conditions)} · ${summary([...properties])}`;
  return {
    id: group.key,
    kind: group.kind,
    label,
    trigger: group.trigger,
    members: group.members,
    state: group.state,
    conditions: group.conditions,
    timeline: group.timeline,
    name: group.name,
  };
}

function sameMovement(
  left: ReadonlyMap<HTMLElement, ReadonlySet<string>>,
  right: ReadonlyMap<HTMLElement, ReadonlySet<string>>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [element, names] of left) {
    const other = right.get(element);
    if (!other || other.size !== names.size) return false;
    for (const name of names) if (!other.has(name)) return false;
  }
  return true;
}

/** Keyframes first, then the states a person tries in order, then application-defined switches. */
function stateRank(group: AnimationGroup): number {
  if (group.state !== null) return STATE_PRECEDENCE[group.state];
  if (group.kind === "keyframes") return -1;
  return 10;
}

/** Keeps one entry per movement: a trigger that restates the same elements and properties under another state is named for the state tried first, while a state that moves something else stays separate and stays runnable. */
function collapseRestatedStates(groups: readonly AnimationGroup[]): AnimationGroup[] {
  // The sort is stable, so entries for unrelated triggers keep the order they were found in.
  const ranked = [...groups].sort((left, right) => stateRank(left) - stateRank(right));
  const kept: AnimationGroup[] = [];
  for (const group of ranked) {
    const restated = group.kind === "state"
      && kept.some((candidate) => candidate.kind === "state" && candidate.trigger === group.trigger && sameMovement(candidate.members, group.members));
    if (!restated) kept.push(group);
  }
  return kept;
}

function addMatched(doc: Document, selector: string, allowed: ReadonlySet<Element>, found: Set<Element>): void {
  let matched: NodeListOf<Element>;
  try {
    matched = doc.querySelectorAll(selector);
  } catch {
    return;
  }
  for (const element of matched) if (allowed.has(element)) found.add(element);
}

/** Elements that may transition or run keyframes, found from the rules and their own inline style rather than by reading every element's computed style: only a handful animate on a large page. */
function motionCandidates(doc: Document, allowed: ReadonlySet<Element>, rules: ReturnType<typeof collectRules>["rules"]): Set<Element> {
  const found = new Set<Element>();
  for (const rule of rules) {
    if (!rule.declarations.some(({ property }) => MOTION_PROPERTIES.has(property))) continue;
    for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
      const selector = branch.trim();
      addMatched(doc, selector, allowed, found);
      const parsed = parseConditions(selector);
      if (parsed) addMatched(doc, parsed.stripped, allowed, found);
    }
  }
  // The element's own style is not in the CSSOM.
  for (const element of doc.querySelectorAll<HTMLElement>("[style]")) {
    if (allowed.has(element) && (element.style.transition !== "" || element.style.animation !== "")) found.add(element);
  }
  return found;
}

function declaresScrollTimeline(declarations: readonly { readonly property: string; readonly value: string }[]): boolean {
  return declarations.some(({ property, value }) => property === "animation-timeline"
    && /(?:^|[\s,])(?:scroll|view)\s*\(/.test(value));
}

/** Elements whose keyframes follow a scroll or view timeline rather than the document clock. */
function scrollTimelineElements(
  doc: Document,
  allowed: ReadonlySet<Element>,
  rules: ReturnType<typeof collectRules>["rules"],
): Set<Element> {
  const found = new Set<Element>();
  for (const rule of rules) {
    if (!declaresScrollTimeline(rule.declarations)) continue;
    for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
      const selector = branch.trim();
      addMatched(doc, selector, allowed, found);
      const parsed = parseConditions(selector);
      if (parsed) addMatched(doc, parsed.stripped, allowed, found);
    }
  }
  return found;
}

/** Names an `animation` or `animation-name` declaration applies, so keyframes behind a state switch are still offered. */
function declaredAnimationNames(declarations: readonly { readonly property: string; readonly value: string }[]): string[] {
  const names: string[] = [];
  for (const { property, value } of declarations) {
    if (property === "animation-name") {
      for (const name of list(value)) if (name !== "none") names.push(name.replace(/^["']|["']$/g, ""));
    } else if (property === "animation") {
      for (const segment of list(value)) {
        const name = segment.split(/\s+/).find((token) => {
          if (!token || ANIMATION_KEYWORDS.has(token.toLowerCase())) return false;
          return /^-?[A-Za-z_][\w-]*$/.test(token) && !/^\d/.test(token);
        });
        if (name) names.push(name);
      }
    }
  }
  return [...new Set(names)];
}

function timelineFor(element: Element, style: CSSStyleDeclaration, scrollElements: ReadonlySet<Element>): AnimationTimelineKind {
  if (scrollElements.has(element)) return "scroll";
  const declared = style.getPropertyValue("animation-timeline").trim();
  return /(?:^|[\s,])(?:scroll|view)\s*\(/.test(declared) ? "scroll" : "document";
}

/** Finds each animation on `elements`: keyframes they run, and the transitions their states set off, grouped by trigger and state. */
function findGroups(
  doc: Document,
  elements: readonly Element[],
  rules: ReturnType<typeof collectRules>["rules"],
  scrollElements: ReadonlySet<Element>,
): AnimationGroup[] {
  const view = doc.defaultView;
  if (!view) return [];
  const groups = new Map<string, MutableGroup>();
  const transitioning = new Map<Element, Set<string>>();
  const allowed = new Set<Element>(elements);
  const candidates = motionCandidates(doc, allowed, rules);

  for (const element of elements) {
    // Elements that declare no transition or keyframes cannot animate, whatever their computed style says.
    if (!candidates.has(element)) continue;
    const style = view.getComputedStyle(element);
    const timeline = timelineFor(element, style, scrollElements);
    const names = list(style.animationName);
    if (names.length > 0 && names[0] !== "none") {
      const durations = list(style.animationDuration);
      names.forEach((name, index) => {
        const duration = parseFloat(durations[index % Math.max(1, durations.length)] ?? "0");
        if (name === "none" || duration <= 0) return;
        const key = `keyframes:${triggerId(asAnimationElement(element))}:${name}`;
        groups.set(key, {
          kind: "keyframes",
          trigger: asAnimationElement(element),
          members: new Map([[asAnimationElement(element), new Set([name])]]),
          state: null,
          conditions: [],
          timeline,
          key,
          name,
        });
      });
    }
    const properties = transitionedProperties(style);
    if (properties.size > 0) transitioning.set(element, properties);
  }

  if (transitioning.size > 0) {
    const moving = new Set<string>();
    for (const properties of transitioning.values()) for (const property of properties) moving.add(property);
    for (const rule of rules) {
      // A rule that touches nothing the page transitions can match all it likes.
      if (!rule.declarations.some(({ property }) => moving.has(property) || moving.has("all"))) continue;
      for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
        const parsed = parseConditions(branch.trim());
        if (!parsed) continue;
        let matched: NodeListOf<Element>;
        try {
          matched = doc.querySelectorAll(parsed.stripped);
        } catch {
          continue;
        }
        for (const candidate of matched) {
          if (!allowed.has(candidate)) continue;
          const properties = transitioning.get(candidate);
          if (!properties) continue;
          const changed = rule.declarations.map(({ property }) => property).filter((property) => properties.has(property) || properties.has("all"));
          if (changed.length === 0) continue;
          for (const compound of parsed.compounds) {
            const trigger = triggerFor(candidate, compound);
            const key = `state:${triggerId(trigger)}:${conditionsKey(compound.conditions)}`;
            let group = groups.get(key);
            if (!group) {
              group = {
                kind: "state",
                trigger,
                members: new Map(),
                state: compound.conditions.find((condition) => condition.kind === "pseudo")?.state ?? null,
                conditions: compound.conditions,
                timeline: "document",
                key,
                name: "",
              };
              groups.set(key, group);
            }
            const member = group.members.get(asAnimationElement(candidate)) ?? new Set<string>();
            for (const property of changed) member.add(property);
            group.members.set(asAnimationElement(candidate), member);
          }
        }
      }
    }
  }

  // Keyframes can themselves be gated by a state switch, so their rules are read even when the page is at rest.
  for (const rule of rules) {
    const names = declaredAnimationNames(rule.declarations);
    if (names.length === 0) continue;
    const scrollDriven = declaresScrollTimeline(rule.declarations);
    for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
      const parsed = parseConditions(branch.trim());
      if (!parsed) continue;
      let matched: NodeListOf<Element>;
      try {
        matched = doc.querySelectorAll(parsed.stripped);
      } catch {
        continue;
      }
      for (const candidate of matched) {
        if (!allowed.has(candidate)) continue;
        for (const compound of parsed.compounds) {
          const trigger = triggerFor(candidate, compound);
          const key = `state:${triggerId(trigger)}:${conditionsKey(compound.conditions)}`;
          let group = groups.get(key);
          if (!group) {
            group = {
              kind: "state",
              trigger,
              members: new Map(),
              state: compound.conditions.find((condition) => condition.kind === "pseudo")?.state ?? null,
              conditions: compound.conditions,
              timeline: scrollDriven || scrollElements.has(candidate) ? "scroll" : "document",
              key,
              name: names[0] ?? "",
            };
            groups.set(key, group);
          }
          if (scrollDriven || scrollElements.has(candidate)) group.timeline = "scroll";
          const member = group.members.get(asAnimationElement(candidate)) ?? new Set<string>();
          for (const name of names) member.add(name);
          group.members.set(asAnimationElement(candidate), member);
        }
      }
    }
  }
  return collapseRestatedStates([...groups.values()].map(buildGroup));
}

/** Every animation on the page, in document order of its trigger. */
export function scanPageAnimations(doc: Document, skip: (element: Element) => boolean = () => false): AnimationGroup[] {
  const elements: HTMLElement[] = [];
  for (const element of doc.body?.querySelectorAll<HTMLElement>("*") ?? []) {
    if (elements.length >= PAGE_ELEMENT_LIMIT) break;
    if (SKIPPED_TAGS.has(element.tagName) || skip(element)) continue;
    elements.push(element);
  }
  const order = new Map(elements.map((element, index) => [element, index]));
  const rules = collectRules(doc).rules;
  const allowed = new Set<Element>(elements);
  return findGroups(doc, elements, rules, scrollTimelineElements(doc, allowed, rules))
    .filter((group) => !skip(group.trigger))
    .sort((left, right) => (order.get(left.trigger) ?? 0) - (order.get(right.trigger) ?? 0));
}

const CLICKABLE_TAGS = new Set(["BUTTON", "INPUT", "SELECT", "SUMMARY", "LABEL", "TEXTAREA"]);
const CLICKABLE_ROLES = new Set(["button", "link", "tab", "menuitem", "switch", "checkbox", "radio", "option"]);

/** Handlers can't be listed, so a click is only offered where the element looks like it takes one. */
function looksClickable(element: HTMLElement): boolean {
  if (CLICKABLE_TAGS.has(element.tagName) || (element.tagName === "A" && element.hasAttribute("href"))) return true;
  if (CLICKABLE_ROLES.has(element.getAttribute("role") ?? "") || element.hasAttribute("onclick")) return true;
  if (Number(element.getAttribute("tabindex") ?? -1) >= 0) return true;
  // `cursor` inherits, so only the element that starts the pointer counts, not everything inside it.
  const view = element.ownerDocument.defaultView;
  if (view?.getComputedStyle(element).cursor !== "pointer") return false;
  const parent = element.parentElement;
  return !parent || view.getComputedStyle(parent).cursor !== "pointer";
}

/** Whether `element` takes part in the group as its trigger, or as an animating member. */
function belongsTo(group: AnimationGroup, element: HTMLElement): boolean {
  if (element === group.trigger || element.contains(group.trigger)) return true;
  for (const member of group.members.keys()) {
    if (member === element || element.contains(member)) return true;
  }
  return false;
}

/** The animations to offer for a selected element. A click is added only beside animations the page declares, because handlers can't be listed and a click on its own usually captures nothing. */
export function scanAnimations(element: HTMLElement): AnimationEntry[] {
  const doc = element.ownerDocument;
  const entries: AnimationEntry[] = [];
  // The whole page is scanned so a trigger can animate a sibling the selection does not contain.
  const groups = scanPageAnimations(doc).filter((group) => belongsTo(group, element));
  for (const group of groups) {
    if (group.kind === "keyframes") entries.push({ id: group.id, kind: "keyframes", label: group.label, name: group.name, group });
    else entries.push({ id: group.id, kind: "state", label: group.label, state: group.state, group });
  }
  // Keyframes on the selection are the most direct thing to run, so they keep the first slot.
  const ordered: AnimationEntry[] = [
    ...entries.filter((entry) => entry.kind === "keyframes"),
    ...entries.filter((entry) => entry.kind === "state"),
  ];
  const scripted = typeof element.getAnimations === "function"
    && element.getAnimations({ subtree: true }).some((animation) => !("animationName" in animation) && !("transitionProperty" in animation));
  if (scripted) ordered.push({ id: "running", kind: "running", label: "Running now" });
  if (ordered.length > 0 && looksClickable(element)) ordered.push(CLICK_ENTRY);
  return ordered;
}
