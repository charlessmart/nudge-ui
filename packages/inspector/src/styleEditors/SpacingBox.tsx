import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { parsePxNumber } from "./computedValue.ts";

export interface SpacingSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function readSides(el: HTMLElement, baseProp: "padding" | "margin"): SpacingSides {
  const computed = getComputedStyle(el);
  return {
    top: parsePxNumber(computed.getPropertyValue(`${baseProp}-top`)),
    right: parsePxNumber(computed.getPropertyValue(`${baseProp}-right`)),
    bottom: parsePxNumber(computed.getPropertyValue(`${baseProp}-bottom`)),
    left: parsePxNumber(computed.getPropertyValue(`${baseProp}-left`)),
  };
}

function shorthand(sides: SpacingSides): string {
  return `${sides.top}px ${sides.right}px ${sides.bottom}px ${sides.left}px`;
}

export interface SpacingBoxProps {
  element: SelectedElement;
}

export function SpacingBox(props: SpacingBoxProps): ReactElement {
  const { element } = props;
  const el = element.domElement;
  const [padding, setPadding] = useState<SpacingSides>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [margin, setMargin] = useState<SpacingSides>({ top: 0, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    setPadding(readSides(el, "padding"));
    setMargin(readSides(el, "margin"));
  }, [el]);

  function commitPadding(next: SpacingSides): void {
    setPadding(next);
    setStyle(el, "padding", shorthand(next));
  }

  function commitMargin(next: SpacingSides): void {
    setMargin(next);
    setStyle(el, "margin", shorthand(next));
  }

  return (
    <div className="dt-editor" data-test="spacing-box">
      <div className="dt-editor__title">Spacing</div>
      <div className="dt-spacing">
        <div className="dt-spacing__group" data-test="spacing-padding">
          <div className="dt-spacing__label">padding</div>
          <SideInput
            kind="padding-top"
            value={padding.top}
            onChange={(v) => commitPadding({ ...padding, top: v })}
          />
          <SideInput
            kind="padding-right"
            value={padding.right}
            onChange={(v) => commitPadding({ ...padding, right: v })}
          />
          <SideInput
            kind="padding-bottom"
            value={padding.bottom}
            onChange={(v) => commitPadding({ ...padding, bottom: v })}
          />
          <SideInput
            kind="padding-left"
            value={padding.left}
            onChange={(v) => commitPadding({ ...padding, left: v })}
          />
        </div>
        <div className="dt-spacing__group" data-test="spacing-margin">
          <div className="dt-spacing__label">margin</div>
          <SideInput
            kind="margin-top"
            value={margin.top}
            onChange={(v) => commitMargin({ ...margin, top: v })}
          />
          <SideInput
            kind="margin-right"
            value={margin.right}
            onChange={(v) => commitMargin({ ...margin, right: v })}
          />
          <SideInput
            kind="margin-bottom"
            value={margin.bottom}
            onChange={(v) => commitMargin({ ...margin, bottom: v })}
          />
          <SideInput
            kind="margin-left"
            value={margin.left}
            onChange={(v) => commitMargin({ ...margin, left: v })}
          />
        </div>
      </div>
    </div>
  );
}

interface SideInputProps {
  kind: string;
  value: number;
  onChange: (v: number) => void;
}

function SideInput(props: SideInputProps): ReactElement {
  const { kind, value, onChange } = props;
  return (
    <label className="dt-spacing__side">
      <span className="dt-spacing__side-label">{kind.replace("-", " ")}</span>
      <input
        type="number"
        data-test={kind}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isNaN(n) ? 0 : n);
        }}
      />
    </label>
  );
}
