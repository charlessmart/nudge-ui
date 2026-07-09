import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { parseLength } from "./computedValue.ts";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge"];

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

export interface BorderEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function BorderEditor(props: BorderEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;

  const [width, setWidth] = useState(0);
  const [styleChoice, setStyleChoice] = useState("solid");
  const [colorToken, setColorToken] = useState("");
  const [radius, setRadius] = useState(0);
  const [shadow, setShadow] = useState("");

  const borderColorRow = findTokenRow(tokenRows, "border-color");
  const borderRadiusRow = findTokenRow(tokenRows, "border-radius");
  const boxShadowRow = findTokenRow(tokenRows, "box-shadow");
  const borderWidthRow = findTokenRow(tokenRows, "border-width");

  useEffect(() => {
    const computed = getComputedStyle(el);
    const w = parseLength(computed.getPropertyValue("border-top-width"));
    setWidth(w.value);
    setStyleChoice(computed.getPropertyValue("border-top-style") || "solid");
    setColorToken(borderColorRow?.tokenName ?? "");
    const r = parseLength(computed.getPropertyValue("border-radius"));
    setRadius(r.value);
    setShadow(computed.getPropertyValue("box-shadow") || "");
  }, [el, borderColorRow]);

  function composeBorderColor(): string {
    if (colorToken) return `var(${colorToken})`;
    const raw = getComputedStyle(el).getPropertyValue("border-top-color").trim();
    return raw || "currentColor";
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
        <div className="dt-field dt-field--token">
          <span className="dt-field__label">width token</span>
          <TokenField
            property="border-width"
            tokenRow={borderWidthRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
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
          <span className="dt-field__label">border-color</span>
          <TokenField
            property="border-color"
            tokenRow={borderColorRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
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
        <div className="dt-field dt-field--token">
          <span className="dt-field__label">radius token</span>
          <TokenField
            property="border-radius"
            tokenRow={borderRadiusRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
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
        <div className="dt-field dt-field--token">
          <span className="dt-field__label">shadow token</span>
          <TokenField
            property="box-shadow"
            tokenRow={boxShadowRow}
            domElement={el}
            entries={allEntries}
            onAfterEdit={onAfterEdit}
          />
        </div>
      </div>
    </div>
  );
}
