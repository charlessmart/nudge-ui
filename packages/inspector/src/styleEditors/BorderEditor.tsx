import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { swapToken } from "../tokens/editActions.ts";
import { setStyle } from "./styleActions.ts";
import { classifyToken } from "../tokens/TokenDropdown.tsx";
import { parseLength } from "./computedValue.ts";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge"];

function colorTokens(entries: TokenEntry[]): TokenEntry[] {
  return entries.filter((e) => classifyToken(e.name) === "color");
}

export interface BorderEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
}

export function BorderEditor(props: BorderEditorProps): ReactElement {
  const { element, entries } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;
  const colors = colorTokens(allEntries);

  const [width, setWidth] = useState(0);
  const [styleChoice, setStyleChoice] = useState("solid");
  const [colorValue, setColorValue] = useState("");
  const [colorToken, setColorToken] = useState("");
  const [radius, setRadius] = useState(0);
  const [shadow, setShadow] = useState("");

  useEffect(() => {
    const computed = getComputedStyle(el);
    const w = parseLength(computed.getPropertyValue("border-top-width"));
    setWidth(w.value);
    setStyleChoice(computed.getPropertyValue("border-top-style") || "solid");
    setColorValue(computed.getPropertyValue("border-top-color") || "");
    setColorToken("");
    const r = parseLength(computed.getPropertyValue("border-radius"));
    setRadius(r.value);
    setShadow(computed.getPropertyValue("box-shadow") || "");
  }, [el]);

  function composeBorderColor(): string {
    if (colorToken) return `var(${colorToken})`;
    return colorValue || "currentColor";
  }

  function handleToken(name: string): void {
    setColorToken(name);
    if (!name) return;
    const chosen = colors.find((c) => c.name === name);
    if (!chosen) return;
    swapToken(el, "border-color", chosen, null);
    setStyle(el, "border", `${width}px ${styleChoice} var(${name})`);
  }

  function handleColorRaw(value: string): void {
    setColorValue(value);
    setColorToken("");
    setStyle(el, "border", `${width}px ${styleChoice} ${value || "currentColor"}`);
  }

  function handleWidth(v: number): void {
    setWidth(v);
    setStyle(el, "border", `${v}px ${styleChoice} ${composeBorderColor()}`);
  }

  function handleStyle(s: string): void {
    setStyleChoice(s);
    setStyle(el, "border", `${width}px ${s} ${composeBorderColor()}`);
  }

  function handleRadius(v: number): void {
    setRadius(v);
    setStyle(el, "border-radius", `${v}px`);
  }

  function handleShadow(value: string): void {
    setShadow(value);
    setStyle(el, "box-shadow", value);
  }

  return (
    <div className="dt-editor" data-test="border-editor">
      <div className="dt-editor__title">Border · radius · shadow</div>
      <div className="dt-border">
        <label className="dt-field">
          <span className="dt-field__label">border-width</span>
          <span className="dt-field__row">
            <input
              type="number"
              data-test="border-width"
              value={width}
              onChange={(e) => {
                const n = Number(e.target.value);
                handleWidth(Number.isNaN(n) ? 0 : n);
              }}
            />
            <span className="dt-field__unit">px</span>
          </span>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">border-style</span>
          <select data-test="border-style" value={styleChoice} onChange={(e) => handleStyle(e.target.value)}>
            {BORDER_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">border-color token</span>
          <select
            data-test="border-color-token"
            value={colorToken}
            onChange={(e) => handleToken(e.target.value)}
          >
            <option value="">— raw —</option>
            {colors.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">border-color raw</span>
          <input
            type="text"
            data-test="border-color-raw"
            value={colorValue}
            onChange={(e) => handleColorRaw(e.target.value)}
          />
        </label>
        <label className="dt-field">
          <span className="dt-field__label">border-radius</span>
          <span className="dt-field__row">
            <input
              type="number"
              data-test="border-radius"
              value={radius}
              onChange={(e) => {
                const n = Number(e.target.value);
                handleRadius(Number.isNaN(n) ? 0 : n);
              }}
            />
            <span className="dt-field__unit">px</span>
          </span>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">box-shadow</span>
          <input
            type="text"
            data-test="box-shadow"
            placeholder="0 2px 4px rgba(0,0,0,0.2)"
            value={shadow}
            onChange={(e) => handleShadow(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
