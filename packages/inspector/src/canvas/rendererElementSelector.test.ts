// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildSelector } from "./rendererElementSelector.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buildSelector", () => {
  it("escapes data-cid values before embedding them in an attribute selector", () => {
    const button = document.createElement("button");
    button.setAttribute("data-cid", 'Button"] ~ *[data-cid="Secret');
    document.body.appendChild(button);

    const selector = buildSelector(button);

    expect(() => document.querySelector(selector)).not.toThrow();
    expect(document.querySelector(selector)).toBe(button);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });
});
