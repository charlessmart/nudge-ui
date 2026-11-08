import { canonicalizeChanges, tokenReference } from "../changes/model.ts";
import { isElementChange, type ChangeRecord, type ElementChangeRecord } from "../changes/types.ts";
import type { ElementComment } from "../comments/store.ts";
import { variantScopeKey, type VariantScope } from "../componentSemantics/variantMarkers.ts";
import type { StructuralChange } from "../projection/structuralProjection.ts";
import { isRuntimeGeneratedSource, normalizeRuntimeTag } from "../runtime/staticHtmlRuntimeIdentity.ts";
import { isPageTargetCid } from "../selection/pageTarget.ts";
import { stylingDialect } from "../../css/dialects/index.ts";
import { EMPTY_SENTINEL, generatePrompt, type FrameworkHints } from "./generatePrompt.ts";
import { PROMPT_INTRO } from "./promptDocument.ts";

/** Everyday names for the properties people edit most; anything else keeps its CSS name. */
const PROPERTY_NAMES = new Map<string, string>([
  ["background", "background"],
  ["background-color", "background"],
  ["color", "text colour"],
  ["border-color", "border colour"],
  ["border-width", "border width"],
  ["border-radius", "corner radius"],
  ["box-shadow", "shadow"],
  ["font-family", "font"],
  ["font-size", "font size"],
  ["font-weight", "font weight"],
  ["line-height", "line height"],
  ["letter-spacing", "letter spacing"],
  ["padding-inline", "horizontal padding"],
  ["padding-block", "vertical padding"],
  ["margin-inline", "horizontal margin"],
  ["margin-block", "vertical margin"],
]);

const STATE_LEADS = {
  base: "",
  hover: "on hover, ",
  active: "while pressed, ",
  focus: "on focus, ",
  "focus-visible": "on keyboard focus, ",
  disabled: "when disabled, ",
} satisfies Record<NonNullable<ElementChangeRecord["state"]>, string>;

/** Props that name a component's main look, so their value reads as the variant's name ("the primary variant"). */
const VARIANT_NAME_PROPS = ["variant", "kind", "type", "appearance", "intent", "tone", "emphasis", "priority"];

const KEEP_COMPONENT = "Change the component itself so every place it's used picks this up.";
const KEEP_VARIANTS = "Leave the other variants as they are.";

interface ElementPart {
  file: string;
  line: number;
  tag: string | undefined;
  /** Variant key → its scope and changes, in the order first edited. */
  variants: Map<string, { scope: VariantScope | undefined; changes: ElementChangeRecord[] }>;
}

interface ComponentEdit {
  name: string;
  file: string;
  elements: Map<string, ElementPart>;
}

function propertyName(property: string): string {
  return PROPERTY_NAMES.get(property) ?? property;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "primary", "primary variant with size sm", or "variant with loading set". */
function variantPhrase(scope: VariantScope): string {
  const names = Object.keys(scope.props).sort();
  const main = names.find((name) => VARIANT_NAME_PROPS.includes(name.toLowerCase()));
  const rest = names.filter((name) => name !== main).map((name) => {
    const value = scope.props[name];
    if (value === true) return `${name} set`;
    if (value === false) return `${name} not set`;
    return `${name} ${String(value)}`;
  });
  const qualifier = rest.length > 0 ? ` with ${rest.join(" and ")}` : "";
  return main ? `${String(scope.props[main])} variant${qualifier}` : `variant${qualifier}`;
}

/** The request itself, in lower case so it can follow a lead-in. */
function changeClause(rec: ElementChangeRecord): string {
  const name = propertyName(rec.property);
  const state = STATE_LEADS[rec.state ?? "base"];
  if (rec.newToken && rec.oldToken) {
    return `${state}make the ${name} use the ${rec.newToken.name} token instead of ${rec.oldToken.name}`;
  }
  if (rec.newToken || rec.rawValue !== undefined) {
    // Adapter token names are not always custom-property names, so emit the literal the stylesheet wrote.
    const after = rec.newToken ? tokenReference(rec.newToken) : rec.rawValue;
    const before = rec.oldRawValue !== undefined ? ` (currently ${rec.oldRawValue})` : "";
    return `${state}make the ${name} ${after}${before}`;
  }
  return `${state}update the ${name} (no value was recorded)`;
}

/** How the edited value maps back onto the code, when the preview differs from what the source wrote. */
function codeNotes(rec: ElementChangeRecord): string[] {
  const notes: string[] = [];
  if (rec.sourceProperty && rec.sourceProperty !== rec.property) {
    notes.push(`The code writes this as ${rec.sourceProperty}${rec.sourceAuthoredValue ? `: ${rec.sourceAuthoredValue}` : ""}.`);
  }
  if (rec.newToken) {
    const dialect = stylingDialect(rec.newToken.adapter);
    const after = dialect?.sourceForm?.(rec.newToken, rec.property);
    if (dialect && after) {
      const before = rec.oldToken?.adapter === dialect.name ? dialect.sourceForm?.(rec.oldToken, rec.property) : null;
      notes.push(`In ${dialect.label} this is the ${after} utility${before && before !== after ? `, in place of ${before}` : ""}.`);
    }
  }
  return notes;
}

function changeLines(rec: ElementChangeRecord): string[] {
  return [`- ${capitalize(changeClause(rec))}.`, ...codeNotes(rec).map((note) => `  ${note}`)];
}

/** Definition edits only: page-wide, per-instance and runtime-created edits keep the page prompt's wording. */
function isDefinitionEdit(change: ChangeRecord): change is ElementChangeRecord {
  return isElementChange(change)
    && !change.instanceOverride
    && !isPageTargetCid(change.cid)
    && change.file !== ""
    && !isRuntimeGeneratedSource(change.file);
}

function groupByComponent(changes: readonly ElementChangeRecord[]): ComponentEdit[] {
  const components = new Map<string, ComponentEdit>();
  for (const change of changes) {
    const name = change.variantScope?.componentName ?? (change.source.component || change.cid);
    const file = change.source.file || change.file;
    const componentKey = JSON.stringify([name, file]);
    let component = components.get(componentKey);
    if (!component) {
      component = { name, file, elements: new Map() };
      components.set(componentKey, component);
    }
    const line = change.source.line || change.line;
    const elementKey = JSON.stringify([change.file, line, change.column ?? 0]);
    let element = component.elements.get(elementKey);
    if (!element) {
      const tag = change.sourceEvidence?.tagName ?? change.runtimeEvidence?.tagName;
      element = { file: change.file, line, tag: tag ? normalizeRuntimeTag(tag) || undefined : undefined, variants: new Map() };
      component.elements.set(elementKey, element);
    }
    const variantKey = variantScopeKey(change.variantScope);
    let variant = element.variants.get(variantKey);
    if (!variant) {
      variant = { scope: change.variantScope, changes: [] };
      element.variants.set(variantKey, variant);
    }
    variant.changes.push(change);
  }
  return [...components.values()];
}

function elementLabel(component: ComponentEdit, element: ElementPart): string {
  const tag = element.tag ? `<${element.tag}>` : "element";
  const where = element.file === component.file ? `line ${element.line}` : `${element.file}:${element.line}`;
  return `the ${tag} on ${where}`;
}

/** One paragraph per element and variant; headings appear only when there is more than one thing to tell apart. */
function componentBlocks(component: ComponentEdit): string[] {
  const elements = [...component.elements.values()];
  const anyScoped = elements.some((element) => [...element.variants.values()].some((variant) => variant.scope));
  const blocks: string[] = [];
  for (const element of elements) {
    for (const { scope, changes } of element.variants.values()) {
      const lines = changes.flatMap(changeLines);
      const variant = scope ? `the ${variantPhrase(scope)}` : anyScoped ? "every variant" : null;
      let heading: string | null = null;
      if (elements.length > 1) {
        heading = `${capitalize(elementLabel(component, element))}${variant ? `, ${scope ? `${variant} only` : variant}` : ""}:`;
      } else if (variant) {
        heading = `For ${variant}:`;
      }
      blocks.push([...(heading ? [heading] : []), ...lines].join("\n"));
    }
  }
  return blocks;
}

function singleChangeSentence(component: ComponentEdit, rec: ElementChangeRecord): string {
  const variant = rec.variantScope ? `for the ${variantPhrase(rec.variantScope)}, ` : "";
  return `Please update the ${component.name} component in ${component.file}: ${variant}${changeClause(rec)}.`;
}

/** The page prompt's own wording for anything that is not a component-definition style edit. */
function remainderBody(
  changes: ChangeRecord[],
  hints: FrameworkHints | undefined,
  structuralChanges: readonly StructuralChange[],
  comments: readonly ElementComment[],
): string | null {
  if (changes.length + structuralChanges.length + comments.length === 0) return null;
  const generated = generatePrompt(changes, hints, structuralChanges, "", comments);
  if (generated === EMPTY_SENTINEL) return null;
  return generated.startsWith(PROMPT_INTRO) ? generated.slice(PROMPT_INTRO.length).trim() || null : generated;
}

/**
 * Writes component-library edits the way a person would ask for them: name the component once,
 * then list what should change, by variant and state, without the page-finding details a definition does not need.
 */
export function generateComponentPrompt(
  changes: readonly ChangeRecord[],
  hints?: FrameworkHints,
  structuralChanges: readonly StructuralChange[] = [],
  customInstructions = "",
  comments: readonly ElementComment[] = [],
): string {
  const canonical = canonicalizeChanges([...changes]);
  const definitionEdits = canonical.filter(isDefinitionEdit);
  const others = canonical.filter((change) => !isDefinitionEdit(change));
  const remainder = remainderBody(others, hints, structuralChanges, comments);
  if (definitionEdits.length === 0 && remainder === null) return EMPTY_SENTINEL;

  const components = groupByComponent(definitionEdits);
  const paragraphs: string[] = [];
  const [only] = components;
  if (components.length === 1 && definitionEdits.length === 1 && only) {
    paragraphs.push(`${singleChangeSentence(only, definitionEdits[0]!)} ${KEEP_COMPONENT}`);
  } else if (components.length === 1 && only) {
    paragraphs.push(`Please update the ${only.name} component in ${only.file}. ${KEEP_COMPONENT}`, ...componentBlocks(only));
  } else if (components.length > 1) {
    paragraphs.push("Please update these components. Change each component itself so every place it's used picks this up.");
    for (const component of components) {
      paragraphs.push(`${component.name} (${component.file}):`, ...componentBlocks(component));
    }
  } else {
    paragraphs.push(PROMPT_INTRO);
  }
  if (definitionEdits.some((change) => change.variantScope)) paragraphs.push(KEEP_VARIANTS);
  if (remainder) paragraphs.push(definitionEdits.length > 0 ? `Also:\n\n${remainder}` : remainder);
  const instructions = customInstructions.trim();
  if (instructions) paragraphs.push(instructions);
  return paragraphs.join("\n\n");
}
