// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { startInteractionStatePreview } from "./interactionStatePreview.ts";
import { getAvailableInteractionStates } from "../tokens/resolution.ts";
import { collectRules, disposeDocumentResolution } from "../tokens/resolution/cssomCollector.ts";

afterEach(() => {
  disposeDocumentResolution(document);
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

it("keeps state preview out of authored inspection and releases it on cleanup", () => {
  const style = document.createElement("style");
  style.textContent = ".button { color: red; } .button:hover { color: blue; }";
  document.head.appendChild(style);
  const button = document.createElement("button");
  button.className = "button";
  document.body.appendChild(button);

  const stop = startInteractionStatePreview(button, "hover");
  try {
    expect(document.querySelector('[data-nudge-ui="state-preview"]')).not.toBeNull();
    expect(getAvailableInteractionStates(button)).toEqual(["base", "hover"]);
    expect(collectRules(document).rules.map((rule) => rule.selectorText)).toEqual([".button", ".button:hover"]);
  } finally {
    stop();
  }
  expect(button.hasAttribute("data-nudge-ui-state-preview")).toBe(false);
  expect(document.querySelector('[data-nudge-ui="state-preview"]')).toBeNull();
});
