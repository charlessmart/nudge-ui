import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { SelectedElement } from "../selectionStore.ts";
import { swapToken } from "../tokens/editActions.ts";
import { setStyle } from "./styleActions.ts";
import { classifyToken } from "../tokens/TokenDropdown.tsx";

function colorTokens(entries: TokenEntry[]): TokenEntry[] {
  return entries.filter((e) => classifyToken(e.name) === "color");
}

function findTokenByValue(entries: TokenEntry[], value: string): TokenEntry | null {
  const target = value.trim().toLowerCase();
  if (!target) return null;
  for (const entry of entries) {
    if (entry.value.trim().toLowerCase() === target) return entry;
  }
  return null;
}

export interface ColorPickerProps {
  element: SelectedElement;
  property?: string;
  entries?: TokenEntry[];
}

export function ColorPicker(props: ColorPickerProps): ReactElement {
  const { element, property = "color", entries } = props;
  const el = element.domElement;
  const allEntries = entries ?? tokens;
  const colors = useMemo(() => colorTokens(allEntries), [allEntries]);
  const [rawHex, setRawHex] = useState("");
  const [selectedToken, setSelectedToken] = useState("");

  useEffect(() => {
    setRawHex("");
    setSelectedToken("");
  }, [el, property]);

  const computedValue = typeof window !== "undefined" ? getComputedStyle(el).getPropertyValue(property).trim() : "";
  const matchedToken = useMemo(
    () => findTokenByValue(colors, computedValue),
    [colors, computedValue],
  );
  const swatchColor = selectedToken
    ? colors.find((c) => c.name === selectedToken)?.value ?? computedValue
    : matchedToken?.value ?? computedValue;

  function handleToken(name: string): void {
    setSelectedToken(name);
    if (!name) return;
    const chosen = colors.find((c) => c.name === name);
    if (!chosen) return;
    const oldToken = matchedToken ?? null;
    swapToken(el, property, chosen, oldToken);
  }

  function handleRaw(value: string): void {
    setRawHex(value);
    if (!value.trim()) return;
    setStyle(el, property, value.trim());
    setSelectedToken("");
  }

  return (
    <div className="dt-editor" data-test="color-picker" data-property={property}>
      <div className="dt-editor__title">Color · {property}</div>
      <div className="dt-color">
        <div className="dt-color__row">
          <span
            className="dt-color__swatch"
            data-test="color-swatch"
            style={{ background: swatchColor || "transparent" }}
          />
          <span className="dt-color__computed" data-test="color-computed">
            {computedValue || "—"}
          </span>
        </div>
        <label className="dt-field">
          <span className="dt-field__label">token</span>
          <select
            data-test="color-token-select"
            value={selectedToken || matchedToken?.name || ""}
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
          <span className="dt-field__label">raw</span>
          <input
            type="text"
            data-test="color-raw"
            placeholder="#abcdef"
            value={rawHex}
            onChange={(e) => handleRaw(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
