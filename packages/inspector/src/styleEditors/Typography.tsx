import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { parseLength } from "./computedValue.ts";

const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

export interface TypographyProps {
  element: SelectedElement;
}

export function Typography(props: TypographyProps): ReactElement {
  const { element } = props;
  const el = element.domElement;
  const [fontSize, setFontSize] = useState(0);
  const [fontSizeUnit, setFontSizeUnit] = useState("px");
  const [fontWeight, setFontWeight] = useState("400");
  const [lineHeight, setLineHeight] = useState("");
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [letterSpacingUnit, setLetterSpacingUnit] = useState("px");

  useEffect(() => {
    const computed = getComputedStyle(el);
    const fs = parseLength(computed.getPropertyValue("font-size"));
    setFontSize(fs.value);
    setFontSizeUnit(fs.unit);
    setFontWeight(computed.getPropertyValue("font-weight") || "400");
    setLineHeight(computed.getPropertyValue("line-height") || "");
    const ls = parseLength(computed.getPropertyValue("letter-spacing"));
    setLetterSpacing(ls.value);
    setLetterSpacingUnit(ls.unit);
  }, [el]);

  return (
    <div className="dt-editor" data-test="typography">
      <div className="dt-editor__title">Typography</div>
      <div className="dt-typography">
        <label className="dt-field">
          <span className="dt-field__label">font-size</span>
          <span className="dt-field__row">
            <input
              type="number"
              data-test="font-size"
              value={fontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                const v = Number.isNaN(n) ? 0 : n;
                setFontSize(v);
                setStyle(el, "font-size", `${v}${fontSizeUnit}`);
              }}
            />
            <select
              data-test="font-size-unit"
              value={fontSizeUnit}
              onChange={(e) => {
                setFontSizeUnit(e.target.value);
                setStyle(el, "font-size", `${fontSize}${e.target.value}`);
              }}
            >
              <option value="px">px</option>
              <option value="em">em</option>
              <option value="rem">rem</option>
              <option value="%">%</option>
            </select>
          </span>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">font-weight</span>
          <select
            data-test="font-weight"
            value={fontWeight}
            onChange={(e) => {
              setFontWeight(e.target.value);
              setStyle(el, "font-weight", e.target.value);
            }}
          >
            {FONT_WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="dt-field">
          <span className="dt-field__label">line-height</span>
          <input
            type="text"
            data-test="line-height"
            value={lineHeight}
            onChange={(e) => {
              setLineHeight(e.target.value);
              setStyle(el, "line-height", e.target.value);
            }}
          />
        </label>
        <label className="dt-field">
          <span className="dt-field__label">letter-spacing</span>
          <span className="dt-field__row">
            <input
              type="number"
              data-test="letter-spacing"
              value={letterSpacing}
              onChange={(e) => {
                const n = Number(e.target.value);
                const v = Number.isNaN(n) ? 0 : n;
                setLetterSpacing(v);
                setStyle(el, "letter-spacing", `${v}${letterSpacingUnit}`);
              }}
            />
            <select
              data-test="letter-spacing-unit"
              value={letterSpacingUnit}
              onChange={(e) => {
                setLetterSpacingUnit(e.target.value);
                setStyle(el, "letter-spacing", `${letterSpacing}${e.target.value}`);
              }}
            >
              <option value="px">px</option>
              <option value="em">em</option>
            </select>
          </span>
        </label>
      </div>
    </div>
  );
}
