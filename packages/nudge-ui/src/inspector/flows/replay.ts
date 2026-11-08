import type { FlowLocator, FlowStep } from "../../transport/flows.ts";

export const DEFAULT_STEP_TIMEOUT_MS = 5000;
const POLL_MS = 25;

export interface ReplayResult {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly failedStep?: number;
  readonly message?: string;
}

const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  button: "button,input[type=button],input[type=submit],input[type=reset],summary",
  link: "a[href],area[href]",
  textbox: "textarea,input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=url],input[type=password],input[type=search]",
  searchbox: "input[type=search]",
  checkbox: "input[type=checkbox]",
  radio: "input[type=radio]",
  combobox: "select",
  heading: "h1,h2,h3,h4,h5,h6",
  dialog: "dialog",
  list: "ul,ol",
  listitem: "li",
  navigation: "nav",
  img: "img",
  main: "main",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function accessibleName(element: Element): string {
  const document = element.ownerDocument;
  const label = element.getAttribute("aria-label");
  if (label) return label;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    if (text.trim()) return text;
  }
  const field = element as HTMLInputElement;
  if (field.labels?.length) return [...field.labels].map((item) => item.textContent ?? "").join(" ");
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    if (field.type === "submit" || field.type === "button") return field.value;
    return field.placeholder || element.getAttribute("title") || "";
  }
  return element.textContent || element.getAttribute("alt") || element.getAttribute("title") || "";
}

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/** Finds the visible element a step names; an exact name beats a partial one, then document order decides. */
export function locate(document: Document, locator: FlowLocator): Element | null {
  let candidates: Element[];
  if (locator.selector) {
    candidates = [...document.querySelectorAll(locator.selector)];
  } else if (locator.testId) {
    candidates = [...document.querySelectorAll(`[data-testid="${CSS.escape(locator.testId)}"],[data-test="${CSS.escape(locator.testId)}"]`)];
  } else if (locator.role) {
    const implicit = IMPLICIT_ROLES[locator.role];
    candidates = [...document.querySelectorAll(`[role="${CSS.escape(locator.role)}"]${implicit ? `,${implicit}` : ""}`)];
  } else {
    candidates = [...document.querySelectorAll("body *")];
  }
  const visible = candidates.filter(isVisible);
  if (locator.text) {
    const wanted = normalize(locator.text);
    const containing = visible.filter((element) => normalize(element.textContent).includes(wanted));
    // The deepest match is what a person would point at; its ancestors contain the same text.
    const deepest = containing.filter((element) => !containing.some((other) => other !== element && element.contains(other)));
    return deepest.find((element) => normalize(element.textContent) === wanted) ?? deepest[0] ?? null;
  }
  if (!locator.name) return visible[0] ?? null;
  const wanted = normalize(locator.name);
  return visible.find((element) => normalize(accessibleName(element)) === wanted)
    ?? visible.find((element) => normalize(accessibleName(element)).includes(wanted))
    ?? null;
}

function describe(locator: FlowLocator): string {
  if (locator.selector) return `selector ${locator.selector}`;
  if (locator.testId) return `test id "${locator.testId}"`;
  if (locator.role) return `${locator.role}${locator.name ? ` named "${locator.name}"` : ""}`;
  return `text "${locator.text ?? ""}"`;
}

function sleep(win: Window, ms: number): Promise<void> {
  return new Promise((resolve) => { win.setTimeout(resolve, ms); });
}

async function waitForElement(win: Window, locator: FlowLocator, timeoutMs: number, enabled = false): Promise<Element> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const element = locate(win.document, locator);
    if (element && !(enabled && (element as HTMLButtonElement).disabled)) return element;
    if (Date.now() >= deadline) {
      throw new Error(element ? `${describe(locator)} stayed disabled for ${timeoutMs} ms` : `No visible ${describe(locator)} after ${timeoutMs} ms`);
    }
    await sleep(win, POLL_MS);
  }
}

type FrameEvents = Window & typeof globalThis;

function pressPointer(win: FrameEvents, element: Element, types: readonly string[]): void {
  const box = element.getBoundingClientRect();
  const position = { bubbles: true, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
  for (const type of types) {
    const PointerCtor = win.PointerEvent;
    element.dispatchEvent(type.startsWith("pointer") && PointerCtor
      ? new PointerCtor(type, { ...position, pointerType: "mouse", isPrimary: true })
      : new win.MouseEvent(type, position));
  }
}

function setNativeValue(win: FrameEvents, element: Element, value: string): void {
  const prototype = element.tagName === "TEXTAREA"
    ? win.HTMLTextAreaElement.prototype
    : element.tagName === "SELECT" ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  // Assigning through the prototype's setter is what makes a React-controlled field notice the change.
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new win.Event("input", { bubbles: true }));
  element.dispatchEvent(new win.Event("change", { bubbles: true }));
}

async function runStep(win: FrameEvents, step: FlowStep, timeoutMs: number): Promise<void> {
  if ("click" in step) {
    const element = await waitForElement(win, step.click, timeoutMs, true);
    // Lets a state update from the previous step settle, as the gap between two real clicks would.
    await sleep(win, 0);
    (element as HTMLElement).focus?.();
    pressPointer(win, element, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
  } else if ("hover" in step) {
    pressPointer(win, await waitForElement(win, step.hover, timeoutMs), ["pointerover", "mouseover", "pointermove", "mousemove"]);
  } else if ("fill" in step) {
    const element = await waitForElement(win, step.fill, timeoutMs, true);
    (element as HTMLElement).focus?.();
    setNativeValue(win, element, step.value);
  } else if ("select" in step) {
    setNativeValue(win, await waitForElement(win, step.select, timeoutMs, true), step.value);
  } else if ("press" in step) {
    const target = step.on ? await waitForElement(win, step.on, timeoutMs) : win.document.activeElement ?? win.document.body;
    for (const type of ["keydown", "keyup"]) {
      target.dispatchEvent(new win.KeyboardEvent(type, { key: step.press, bubbles: true, cancelable: true, composed: true }));
    }
  } else if ("waitFor" in step) {
    await waitForElement(win, step.waitFor, step.timeoutMs ?? timeoutMs);
  } else {
    await sleep(win, Math.min(step.waitMs, timeoutMs));
  }
}

/** Marks the frame while steps run, so the renderer lets their clicks reach the application. */
export const FLOW_REPLAYING_GLOBAL = "__nudgeUiFlowReplaying";

/** Runs a state's steps inside a same-origin frame, stopping at the first that fails. */
export async function replayFlowSteps(win: Window, steps: readonly FlowStep[], timeoutMs = DEFAULT_STEP_TIMEOUT_MS): Promise<ReplayResult> {
  const started = Date.now();
  const scope = win as Window & { [FLOW_REPLAYING_GLOBAL]?: boolean };
  scope[FLOW_REPLAYING_GLOBAL] = true;
  try {
    for (const [index, step] of steps.entries()) {
      try {
        await runStep(win as FrameEvents, step, timeoutMs);
      } catch (error) {
        return {
          ok: false,
          durationMs: Date.now() - started,
          failedStep: index,
          message: `Step ${index + 1}: ${error instanceof Error ? error.message : "failed"}`,
        };
      }
    }
    return { ok: true, durationMs: Date.now() - started };
  } finally {
    scope[FLOW_REPLAYING_GLOBAL] = false;
  }
}
