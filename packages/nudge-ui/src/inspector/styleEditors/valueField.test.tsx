// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { useValueDraft, type ValueDraftOptions } from "./valueField.ts";
import { mount } from "./_testUtils.ts";

function Harness(options: Partial<ValueDraftOptions> & { readonly commits: string[] }): ReactElement {
  const { commits, ...rest } = options;
  const field = useValueDraft({
    value: "10px",
    mixed: false,
    blocked: false,
    property: "width",
    onCommit: (next) => commits.push(next),
    ...rest,
  });
  return (
    <input
      data-test="field"
      value={field.draft}
      onChange={(event) => field.setDraft(event.target.value)}
      onBlur={field.handleBlur}
      onKeyDown={field.handleKeyDown}
    />
  );
}

function field(handle: ReturnType<typeof mount>): HTMLInputElement {
  return handle.host.querySelector<HTMLInputElement>('[data-test="field"]')!;
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLInputElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  act(() => input.dispatchEvent(event));
  return event;
}

function blur(input: HTMLInputElement): void {
  act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}

describe("useValueDraft", () => {
  it("commits an edited draft on blur and leaves an untouched one alone", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} />);
    const input = field(handle);

    blur(input);
    expect(commits).toEqual([]);

    type(input, "24px");
    blur(input);
    expect(commits).toEqual(["24px"]);
    handle.unmount();
  });

  it("reverts the draft on Escape without committing", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} />);
    const input = field(handle);

    type(input, "24px");
    press(input, "Escape");
    expect(commits).toEqual([]);
    expect(field(handle).value).toBe("10px");
    handle.unmount();
  });

  it("steps the value with the vertical arrows and leaves horizontal arrows to the caret", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} />);
    const input = field(handle);

    press(input, "ArrowUp");
    expect(field(handle).value).toBe("11px");
    press(input, "ArrowDown");
    expect(field(handle).value).toBe("10px");

    const right = press(input, "ArrowRight");
    expect(right.defaultPrevented).toBe(false);
    expect(field(handle).value).toBe("10px");
    handle.unmount();
  });

  it("takes a larger step with shift held", () => {
    const handle = mount(<Harness commits={[]} />);
    press(field(handle), "ArrowUp", true);
    expect(field(handle).value).toBe("18px");
    handle.unmount();
  });

  it("commits a nudge straight away when the field asks for it", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} commitOnNudge />);
    press(field(handle), "ArrowUp");
    expect(commits).toEqual(["11px"]);
    handle.unmount();
  });

  it("reverts instead of committing an empty draft", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} />);
    const input = field(handle);
    type(input, "   ");
    blur(input);
    expect(commits).toEqual([]);
    expect(field(handle).value).toBe("10px");
    handle.unmount();
  });

  it("keeps a dirty draft when a projection changes the value underneath", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} />);
    type(field(handle), "24px");

    act(() => handle.root.render(<Harness commits={commits} value="12px" />));
    expect(field(handle).value).toBe("24px");

    act(() => handle.root.render(<Harness commits={commits} value="12px" />));
    blur(field(handle));
    expect(commits).toEqual(["24px"]);
    handle.unmount();
  });

  it("drops a dirty draft when the reset key names a different target", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} resetKey={first} />);
    type(field(handle), "24px");

    act(() => handle.root.render(<Harness commits={commits} resetKey={second} value="12px" />));
    expect(field(handle).value).toBe("12px");

    blur(field(handle));
    expect(commits).toEqual([]);
    handle.unmount();
  });

  it("commits the empty value instead of reverting when the field names one", () => {
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} emptyValue="auto" />);
    const input = field(handle);
    type(input, "");
    blur(input);
    expect(commits).toEqual(["auto"]);
    handle.unmount();
  });

  it("treats a rebuilt element list as the same target and a changed one as new", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const commits: string[] = [];
    const handle = mount(<Harness commits={commits} resetKey={[first]} />);
    type(field(handle), "24px");

    act(() => handle.root.render(<Harness commits={commits} resetKey={[first]} value="12px" />));
    expect(field(handle).value).toBe("24px");

    act(() => handle.root.render(<Harness commits={commits} resetKey={[first, second]} value="12px" />));
    expect(field(handle).value).toBe("12px");
    blur(field(handle));
    expect(commits).toEqual([]);
    handle.unmount();
  });
});
