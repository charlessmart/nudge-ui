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

export function trackedElementStack(target: EventTarget | null): HTMLElement[] {
  if (!(target instanceof Element)) return [];

  const stack: HTMLElement[] = [];
  let element: Element | null = target;
  while (element) {
    if (element instanceof HTMLElement && element.hasAttribute("data-cid")) {
      stack.push(element);
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
