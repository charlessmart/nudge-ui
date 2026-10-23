import { isDeepSelectionClick, type ClickModifiers } from "../overlay/clickPolicy.ts";

export type SelectionTargetMode = "primary" | "deep";

const INTERACTIVE_TAGS = new Set([
  "a",
  "area",
  "button",
  "input",
  "option",
  "select",
  "summary",
  "textarea",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "link",
  "menuitem",
  "option",
  "radio",
  "switch",
  "tab",
]);

export function selectionTargetMode(event: ClickModifiers): SelectionTargetMode {
  return isDeepSelectionClick(event) ? "deep" : "primary";
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function isElementNode(target: EventTarget | null): target is Element {
  // SAFETY: only `nodeType` is read, and optional chaining covers targets that are not nodes.
  return (target as Node | null)?.nodeType === 1;
}

/** Node-type checks rather than `instanceof`, so elements of a Canvas frame's document qualify too. */
export function trackedElementStack(target: EventTarget | null): HTMLElement[] {
  if (!isElementNode(target)) return [];

  const stack: HTMLElement[] = [];
  let element: Element | null = target;
  while (element) {
    if (element.namespaceURI === HTML_NAMESPACE && element.hasAttribute("data-cid")) {
      // SAFETY: an element in the XHTML namespace is an HTMLElement of its own document's realm.
      stack.push(element as HTMLElement);
    }
    element = element.parentElement;
  }
  return stack;
}

function isPrimaryElement(element: HTMLElement): boolean {
  const tag = element.localName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = element.getAttribute("role")?.trim().toLowerCase();
  return role ? INTERACTIVE_ROLES.has(role) : false;
}

export function resolveSelectionTarget(
  target: EventTarget | null,
  mode: SelectionTargetMode = "primary",
): HTMLElement | null {
  const stack = trackedElementStack(target);
  if (mode === "deep") return stack[0] ?? null;
  return stack.find(isPrimaryElement) ?? stack[0] ?? null;
}
