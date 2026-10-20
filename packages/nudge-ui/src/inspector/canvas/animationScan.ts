import { collectRules } from "../tokens/resolution/cssomCollector.ts";
import { selectorPseudoClasses, splitSelectorAtTopLevel } from "../tokens/resolution/selectorSemantics.ts";
import type { InteractionState } from "../shell/styleState.ts";

export type PreviewState = Exclude<InteractionState, "base" | "disabled">;

/**
 * One animation as a person sees it: the element whose state or keyframes set it off, and every
 * element that moves because of it. Hover and focus count as the same trigger, so they merge.
 */
export interface AnimationGroup {
  readonly id: string;
  readonly kind: "keyframes" | "state";
  readonly label: string;
  /** The topmost element involved: the one carrying the state, or the element with the keyframes. */
  readonly trigger: HTMLElement;
  /** Elements that animate, each with the properties (or keyframes name) that change. */
  readonly members: ReadonlyMap<HTMLElement, ReadonlySet<string>>;
  /** What to force when running it: hover covers focus, so this is hover unless only focus or active applies. */
  readonly state: PreviewState | null;
  readonly name: string;
}

export type AnimationEntry =
  | { readonly id: string; readonly kind: "keyframes"; readonly label: string; readonly name: string; readonly group: AnimationGroup }
  | { readonly id: string; readonly kind: "state"; readonly label: string; readonly state: PreviewState; readonly group: AnimationGroup }
  | { readonly id: string; readonly kind: "running"; readonly label: string }
  | { readonly id: string; readonly kind: "click"; readonly label: string };

export const CLICK_ENTRY: AnimationEntry = { id: "click", kind: "click", label: "Click" };

const MAX_ELEMENTS = 300;
const PAGE_ELEMENT_LIMIT = 5000;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "NOSCRIPT", "TEMPLATE"]);

function isPreviewState(name: string): name is PreviewState {
  return name === "hover" || name === "focus-visible" || name === "focus" || name === "active";
}

/** Hover, focus and focus-visible are one trigger as far as the animation goes; press is its own. */
function triggerClass(state: PreviewState): "pointer" | "press" {
  return state === "active" ? "press" : "pointer";
}

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

interface StatefulCompound {
  readonly state: PreviewState;
  /** The compound that carries the state, with the state removed: `.card` for `.card:hover .child`. */
  readonly compound: string;
}

/** Splits a selector into the compounds that carry an interaction state and the selector with every state removed. */
function parseStates(branch: string): { readonly stripped: string; readonly compounds: readonly StatefulCompound[] } | null {
  const pseudos = selectorPseudoClasses(branch).filter((pseudo) => isPreviewState(pseudo.name));
  if (pseudos.length === 0) return null;
  const remove = (text: string, offset: number, ranges: typeof pseudos): string => {
    let result = text;
    for (const pseudo of [...ranges].reverse()) {
      result = result.slice(0, pseudo.start - offset) + result.slice(pseudo.end - offset);
    }
    return result;
  };
  const compounds = pseudos.map((pseudo) => {
    let start = pseudo.start;
    let depth = 0;
    while (start > 0) {
      const character = branch[start - 1]!;
      if (character === ")" || character === "]") depth++;
      else if (character === "(" || character === "[") depth--;
      else if (depth === 0 && /[\s>+~]/.test(character)) break;
      start--;
    }
    let end = pseudo.end;
    depth = 0;
    while (end < branch.length) {
      const character = branch[end]!;
      if (character === "(" || character === "[") depth++;
      else if (character === ")" || character === "]") depth--;
      else if (depth === 0 && /[\s>+~]/.test(character)) break;
      end++;
    }
    const inside = pseudos.filter((candidate) => candidate.start >= start && candidate.end <= end);
    return { state: pseudo.name as PreviewState, compound: remove(branch.slice(start, end), start, inside).trim() || "*" };
  });
  return { stripped: remove(branch, 0, pseudos).trim() || "*", compounds };
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
  readonly states: Set<PreviewState>;
  readonly key: string;
  readonly name: string;
}

function buildGroup(group: MutableGroup): AnimationGroup {
  const properties = new Set<string>();
  for (const names of group.members.values()) for (const name of names) properties.add(name);
  let state: PreviewState | null = null;
  let label: string;
  if (group.kind === "keyframes") {
    label = group.name;
  } else {
    state = group.states.has("hover") ? "hover" : group.states.has("focus-visible") ? "focus-visible" : group.states.has("focus") ? "focus" : "active";
    label = `${state === "active" ? "Active" : "Hover"} · ${summary([...properties])}`;
  }
  return { id: group.key, kind: group.kind, label, trigger: group.trigger, members: group.members, state, name: group.name };
}

/** Finds each animation on `elements`: keyframes they run, and the transitions their states set off, grouped by trigger. */
function findGroups(doc: Document, elements: readonly HTMLElement[]): AnimationGroup[] {
  const view = doc.defaultView;
  if (!view) return [];
  const groups = new Map<string, MutableGroup>();
  const transitioning = new Map<HTMLElement, Set<string>>();

  for (const element of elements) {
    const style = view.getComputedStyle(element);
    const names = list(style.animationName);
    if (names.length > 0 && names[0] !== "none") {
      const durations = list(style.animationDuration);
      names.forEach((name, index) => {
        const duration = parseFloat(durations[index % Math.max(1, durations.length)] ?? "0");
        if (name === "none" || duration <= 0) return;
        const key = `keyframes:${triggerId(element)}:${name}`;
        groups.set(key, { kind: "keyframes", trigger: element, members: new Map([[element, new Set([name])]]), states: new Set(), key, name });
      });
    }
    const properties = transitionedProperties(style);
    if (properties.size > 0) transitioning.set(element, properties);
  }

  if (transitioning.size > 0) {
    for (const rule of collectRules(doc).rules) {
      for (const branch of splitSelectorAtTopLevel(rule.selectorText, ",")) {
        const parsed = parseStates(branch.trim());
        if (!parsed) continue;
        let matched: NodeListOf<Element>;
        try {
          matched = doc.querySelectorAll(parsed.stripped);
        } catch {
          continue;
        }
        for (const candidate of matched) {
          const properties = transitioning.get(candidate as HTMLElement);
          if (!properties) continue;
          const changed = rule.declarations.map(({ property }) => property).filter((property) => properties.has(property) || properties.has("all"));
          if (changed.length === 0) continue;
          for (const { state, compound } of parsed.compounds) {
            let trigger: HTMLElement;
            try {
              trigger = (candidate.closest(compound) as HTMLElement | null) ?? (candidate as HTMLElement);
            } catch {
              trigger = candidate as HTMLElement;
            }
            const key = `state:${triggerId(trigger)}:${triggerClass(state)}`;
            let group = groups.get(key);
            if (!group) {
              group = { kind: "state", trigger, members: new Map(), states: new Set(), key, name: "" };
              groups.set(key, group);
            }
            group.states.add(state);
            const member = group.members.get(candidate as HTMLElement) ?? new Set<string>();
            for (const property of changed) member.add(property);
            group.members.set(candidate as HTMLElement, member);
          }
        }
      }
    }
  }
  return [...groups.values()].map(buildGroup);
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
  return findGroups(doc, elements)
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
  return element.ownerDocument.defaultView?.getComputedStyle(element).cursor === "pointer";
}

/** Whether capturing `element` would catch the group: it holds the trigger, or is or contains an animating member. */
function belongsTo(group: AnimationGroup, element: HTMLElement): boolean {
  if (element.contains(group.trigger)) return true;
  if (group.kind === "keyframes" || !group.trigger.contains(element)) return false;
  for (const member of group.members.keys()) {
    if (member === element || element.contains(member)) return true;
  }
  return false;
}

/** The animations to offer for a selected element, plus a click when it looks clickable. */
export function scanAnimations(element: HTMLElement): AnimationEntry[] {
  const doc = element.ownerDocument;
  const entries: AnimationEntry[] = [];
  const subtree = [element, ...Array.from(element.querySelectorAll<HTMLElement>("*")).slice(0, MAX_ELEMENTS)];
  // A trigger above the selection still counts, so its ancestors are scanned too.
  const ancestors: HTMLElement[] = [];
  for (let node = element.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) ancestors.push(node);
  for (const group of findGroups(doc, [...subtree, ...ancestors])) {
    if (!belongsTo(group, element)) continue;
    if (group.kind === "keyframes") entries.push({ id: group.id, kind: "keyframes", label: group.label, name: group.name, group });
    else entries.push({ id: group.id, kind: "state", label: group.label, state: group.state ?? "hover", group });
  }
  const scripted = element.getAnimations({ subtree: true }).some((animation) => !("animationName" in animation) && !("transitionProperty" in animation));
  if (scripted) entries.push({ id: "running", kind: "running", label: "Running now" });
  if (looksClickable(element)) entries.push(CLICK_ENTRY);
  return entries;
}
